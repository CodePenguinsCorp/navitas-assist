package br.com.navitasassist.service;

import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

import br.com.navitasassist.access.AccessProfile;
import br.com.navitasassist.access.Permission;
import br.com.navitasassist.auth.AccountSessionRevoker;
import br.com.navitasassist.auth.BoundedBCryptPasswordEncoder;
import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.controller.ResourceNotFoundException;
import br.com.navitasassist.pagination.PageParams;
import br.com.navitasassist.pagination.PageResponse;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.user.AssignableUserResponse;
import br.com.navitasassist.user.CurrentUserResponse;
import br.com.navitasassist.user.UserAccount;
import br.com.navitasassist.user.UserAccountRequest;
import br.com.navitasassist.user.UserAccountResponse;
import br.com.navitasassist.user.UserAccountUpdateRequest;
import br.com.navitasassist.user.UserSummaryResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class UserAccountService {
    private final AuditService audit;

    private final UserAccountRepository userAccountRepository;
    private final AccessProfileService accessProfileService;
    private final RmaRecordRepository rmaRecordRepository;
    private final PasswordEncoder passwordEncoder;
    private final ApplicationEventPublisher events;
    private final AdministratorGuard administratorGuard;
    private final PermissionGrantPolicy permissionGrantPolicy;
    private final EffectivePermissionService effectivePermissionService;

    @Transactional(readOnly = true)
    public PageResponse<UserAccountResponse> search(String query, Long profileId, Boolean active, Integer page, Integer size) {
        String normalizedQuery = query == null || query.isBlank() ? null : query.trim();
        return PageResponse.from(
            userAccountRepository.search(normalizedQuery, profileId, active, PageParams.of(page, size)),
            UserAccountResponse::from
        );
    }

    @Transactional(readOnly = true)
    public UserSummaryResponse summarize() {
        // D13: admins = usuários, ativos ou não, com usuarios.gerir e perfis.gerir efetivas; roles = perfis em uso.
        long administrators = userAccountRepository.findAll().stream()
            .filter(effectivePermissionService::isAdministrator)
            .count();
        return new UserSummaryResponse(
            userAccountRepository.count(),
            userAccountRepository.countByActiveTrue(),
            administrators,
            userAccountRepository.countDistinctProfiles()
        );
    }

    @Transactional(readOnly = true)
    public List<AssignableUserResponse> listAssignableTechnicians() {
        return userAccountRepository.findAllByActiveTrueOrderByFullNameAsc()
            .stream()
            .filter(this::isAssignable)
            .map(AssignableUserResponse::from)
            .toList();
    }

    public UserAccountResponse create(UserAccountRequest request, String actor) {
        validateUsername(null, request.username());
        AccessProfile profile = accessProfileService.getEntity(request.profileId());
        Set<String> extras = validateExtras(request.extraPermissions());
        ensureCanGrant(actor, profile, extras);

        UserAccount userAccount = new UserAccount();
        userAccount.setUsername(trim(request.username()));
        userAccount.setFullName(trim(request.fullName()));
        userAccount.setEmail(validateEmail(userAccount.getId(), request.email()));
        userAccount.setPasswordHash(passwordEncoder.encode(request.password()));
        userAccount.setProfile(profile);
        userAccount.setExtraPermissions(extras);
        userAccount.setActive(request.active());

        saveWithEmailConstraint(userAccount);
        audit.record("CREATE", "USER", userAccount.getId(), userAccount.getUsername(), "Usuário criado.");
        return UserAccountResponse.from(userAccount);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public UserAccountResponse update(Long id, UserAccountUpdateRequest request, String actor) {
        UserAccount userAccount = getEntityForAdministration(id);
        var before = UserAccountResponse.from(userAccount);
        Set<String> beforePermissions = new HashSet<>(Permission.codes(effectivePermissionService.effectivePermissions(userAccount)));
        AccessProfile newProfile = accessProfileService.getEntity(request.profileId());
        Set<String> newExtras = validateExtras(request.extraPermissions());
        administratorGuard.ensureRemainsAfterUserChange(userAccount, newProfile, newExtras, request.active());
        // Anti-escalada sobre o estado atual e o resultante: quem não é administrador não mexe em quem tem mais acesso.
        Set<Permission> touched = effectivePermissionService.effectivePermissions(userAccount);
        touched.addAll(effectivePermissionService.effectivePermissions(newProfile.getPermissions(), newExtras));
        permissionGrantPolicy.ensureCanGrant(actor, touched);
        validateUsername(userAccount, request.username());
        BoundedBCryptPasswordEncoder.validatePasswordLength(request.password());

        boolean passwordChanged = request.password() != null && !request.password().isBlank();
        // D8: perfil e extras valem na próxima requisição (EffectiveAuthoritiesFilter); só nome de usuário, situação
        // ativa e senha encerram as sessões.
        boolean sessionsRevoked = !Objects.equals(userAccount.getUsername(), trim(request.username()))
            || userAccount.isActive() != request.active()
            || passwordChanged;

        userAccount.setUsername(trim(request.username()));
        userAccount.setFullName(trim(request.fullName()));
        // Campo ausente preserva o e-mail; null explícito ou branco limpa (o frontend sempre envia o campo).
        if (request.email() != null) {
            userAccount.setEmail(validateEmail(userAccount.getId(), request.email().orElse(null)));
        }
        if (passwordChanged) {
            userAccount.setPasswordHash(passwordEncoder.encode(request.password()));
        }
        userAccount.setProfile(newProfile);
        userAccount.getExtraPermissions().clear();
        userAccount.getExtraPermissions().addAll(newExtras);
        userAccount.setActive(request.active());

        UserAccountResponse response = UserAccountResponse.from(saveWithEmailConstraint(userAccount));
        String summary = AuditService.changedFields(before, response);
        if (!Objects.equals(before.email(), response.email())) summary += " E-mail alterado.";
        if (passwordChanged) summary += " Senha alterada.";
        if (before.active() != response.active()) summary += response.active() ? " Usuário ativado." : " Usuário desativado.";
        audit.record("UPDATE", "USER", id, userAccount.getUsername(), summary);
        if (!Objects.equals(before.profile().id(), newProfile.getId())) {
            audit.recordPermissionChanges("USER", id, userAccount.getUsername(), beforePermissions, Permission.codes(effectivePermissionService.effectivePermissions(userAccount)));
        }
        audit.recordPermissionChanges("USER", id, userAccount.getUsername(), new HashSet<>(before.extraPermissions()), newExtras, "extra ");
        if (sessionsRevoked) {
            events.publishEvent(new AccountSessionRevoker.AccessChanged(id));
        }
        return response;
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void delete(Long id, String authenticatedUsername) {
        UserAccount userAccount = getEntityForAdministration(id);

        if (userAccount.getUsername().equalsIgnoreCase(authenticatedUsername)) {
            throw new BusinessException("You cannot delete your own user account.");
        }
        administratorGuard.ensureRemainsAfterUserDeletion(userAccount);
        permissionGrantPolicy.ensureCanGrant(authenticatedUsername, effectivePermissionService.effectivePermissions(userAccount));
        if (rmaRecordRepository.existsByAssignee_Id(id)) {
            throw new BusinessException("Usuário é responsável por uma ou mais ordens de serviço e não pode ser excluído.");
        }

        userAccountRepository.delete(userAccount);
        audit.record("DELETE", "USER", id, userAccount.getUsername(), "Usuário excluído.");
        events.publishEvent(new AccountSessionRevoker.AccessChanged(id));
    }

    @Transactional(readOnly = true)
    public UserAccount getAssignableTechnicianById(Long id) {
        UserAccount userAccount = getEntityById(id);
        if (!userAccount.isActive()) {
            throw new BusinessException("Usuários inativos não podem ser responsáveis por uma OS.");
        }
        if (!isAssignable(userAccount)) {
            throw new BusinessException("Somente técnicos podem ser responsáveis por uma OS.");
        }
        return userAccount;
    }

    @Transactional(readOnly = true)
    public UserAccount getEntityById(Long id) {
        return userAccountRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("User not found: " + id));
    }

    @Transactional(readOnly = true)
    public UserAccount getEntityByUsername(String username) {
        return userAccountRepository.findByUsernameIgnoreCase(username)
            .orElseThrow(() -> new ResourceNotFoundException("User not found: " + username));
    }

    @Transactional(readOnly = true)
    public CurrentUserResponse getCurrentUser(String username) {
        UserAccount userAccount = getEntityByUsername(username);
        return CurrentUserResponse.from(userAccount, effectivePermissionService.effectivePermissions(userAccount));
    }

    private String validateEmail(Long id, String email) {
        if (email == null) return null;
        if (email.indexOf('\r') >= 0 || email.indexOf('\n') >= 0 || email.length() > 254) throw new BusinessException("Invalid email address.");
        if (email.isBlank()) return null;
        String normalized = email.trim().toLowerCase(java.util.Locale.ROOT);
        if (!br.com.navitasassist.notification.email.EmailMessage.validAddress(normalized)) throw new BusinessException("Invalid email address.");
        if (userAccountRepository.findByEmailIgnoreCase(normalized).filter(user -> !Objects.equals(user.getId(), id)).isPresent()) throw new BusinessException("Email already registered.");
        return normalized;
    }

    private UserAccount saveWithEmailConstraint(UserAccount user) {
        try { return userAccountRepository.saveAndFlush(user); }
        catch (org.springframework.dao.DataIntegrityViolationException error) {
            Throwable cause = error;
            while (cause != null) {
                if (cause instanceof org.hibernate.exception.ConstraintViolationException violation
                    && violation.getConstraintName() != null && violation.getConstraintName().toLowerCase(java.util.Locale.ROOT).contains("uk_user_accounts_email")) {
                    throw new BusinessException("Email already registered.");
                }
                cause = cause.getCause();
            }
            throw error;
        }
    }

    private void validateUsername(UserAccount existing, String username) {
        String normalizedUsername = trim(username);
        boolean duplicate = userAccountRepository.existsByUsernameIgnoreCase(normalizedUsername)
            && (existing == null || !existing.getUsername().equalsIgnoreCase(normalizedUsername));

        if (duplicate) {
            throw new BusinessException("Username already registered: " + normalizedUsername);
        }
    }

    private UserAccount getEntityForAdministration(Long id) {
        // All reductions take the same ordered locks (profiles, then active users) before locking their target.
        administratorGuard.lockAccessGraph();
        return userAccountRepository.findByIdForUpdate(id).orElseThrow(() -> new ResourceNotFoundException("User not found: " + id));
    }

    /** D1: pode ser responsável por RMA quem tem {@code rma.atribuivel} efetiva. */
    private boolean isAssignable(UserAccount userAccount) {
        return effectivePermissionService.has(userAccount, Permission.RMA_ATRIBUIVEL);
    }

    /** Extras válidas do pedido ({@code null} vale vazio), como códigos do catálogo. */
    private Set<String> validateExtras(Set<String> extras) {
        return new HashSet<>(Permission.codes(accessProfileService.validateCodes(extras == null ? Set.of() : extras)));
    }

    /** Anti-escalada (spec §4.4) sobre o estado resultante: permissões do perfil escolhido mais as extras. */
    private void ensureCanGrant(String actor, AccessProfile profile, Set<String> extras) {
        permissionGrantPolicy.ensureCanGrant(actor, effectivePermissionService.effectivePermissions(profile.getPermissions(), extras));
    }

    private String trim(String value) {
        return value == null ? null : value.trim();
    }
}
