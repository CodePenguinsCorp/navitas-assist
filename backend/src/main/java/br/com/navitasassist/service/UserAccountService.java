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
        userAccount.setPasswordHash(passwordEncoder.encode(request.password()));
        userAccount.setProfile(profile);
        userAccount.setExtraPermissions(extras);
        userAccount.setActive(request.active());

        return UserAccountResponse.from(userAccountRepository.save(userAccount));
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public UserAccountResponse update(Long id, UserAccountUpdateRequest request, String actor) {
        UserAccount userAccount = getEntityForAdministration(id);
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
        if (passwordChanged) {
            userAccount.setPasswordHash(passwordEncoder.encode(request.password()));
        }
        userAccount.setProfile(newProfile);
        userAccount.getExtraPermissions().clear();
        userAccount.getExtraPermissions().addAll(newExtras);
        userAccount.setActive(request.active());

        UserAccountResponse response = UserAccountResponse.from(userAccountRepository.save(userAccount));
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
            throw new BusinessException("User is assigned to one or more RMAs and cannot be deleted.");
        }

        userAccountRepository.delete(userAccount);
        events.publishEvent(new AccountSessionRevoker.AccessChanged(id));
    }

    @Transactional(readOnly = true)
    public UserAccount getAssignableTechnicianById(Long id) {
        UserAccount userAccount = getEntityById(id);
        if (!userAccount.isActive()) {
            throw new BusinessException("Inactive users cannot be assigned to an RMA.");
        }
        if (!isAssignable(userAccount)) {
            throw new BusinessException("Only technicians can be assigned to an RMA.");
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
