package br.com.navitasassist.service;

import java.util.List;
import java.util.Objects;

import br.com.navitasassist.access.AccessProfile;
import br.com.navitasassist.auth.AccountSessionRevoker;
import br.com.navitasassist.auth.BoundedBCryptPasswordEncoder;
import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.controller.ResourceNotFoundException;
import br.com.navitasassist.pagination.PageParams;
import br.com.navitasassist.pagination.PageResponse;
import br.com.navitasassist.repository.AccessProfileRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.user.AssignableUserResponse;
import br.com.navitasassist.user.UserAccount;
import br.com.navitasassist.user.UserAccountRequest;
import br.com.navitasassist.user.UserAccountResponse;
import br.com.navitasassist.user.UserAccountUpdateRequest;
import br.com.navitasassist.user.UserRole;
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
    private final AccessProfileRepository accessProfileRepository;
    private final RmaRecordRepository rmaRecordRepository;
    private final PasswordEncoder passwordEncoder;
    private final ApplicationEventPublisher events;

    @Transactional(readOnly = true)
    public PageResponse<UserAccountResponse> search(String query, UserRole role, Boolean active, Integer page, Integer size) {
        String normalizedQuery = query == null || query.isBlank() ? null : query.trim();
        return PageResponse.from(
            userAccountRepository.search(normalizedQuery, role, active, PageParams.of(page, size)),
            UserAccountResponse::from
        );
    }

    @Transactional(readOnly = true)
    public UserSummaryResponse summarize() {
        return new UserSummaryResponse(
            userAccountRepository.count(),
            userAccountRepository.countByActiveTrue(),
            userAccountRepository.countByRole(UserRole.ADMIN),
            userAccountRepository.countDistinctRoles()
        );
    }

    @Transactional(readOnly = true)
    public List<AssignableUserResponse> listAssignableTechnicians() {
        return userAccountRepository.findAllByActiveTrueAndRoleOrderByFullNameAsc(UserRole.TECHNICIAN)
            .stream()
            .map(AssignableUserResponse::from)
            .toList();
    }

    public UserAccountResponse create(UserAccountRequest request) {
        validateUsername(null, request.username());

        UserAccount userAccount = new UserAccount();
        userAccount.setUsername(trim(request.username()));
        userAccount.setFullName(trim(request.fullName()));
        userAccount.setPasswordHash(passwordEncoder.encode(request.password()));
        userAccount.setRole(request.role());
        userAccount.setProfile(legacyProfile(request.role()));
        userAccount.setActive(request.active());

        return UserAccountResponse.from(userAccountRepository.save(userAccount));
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public UserAccountResponse update(Long id, UserAccountUpdateRequest request) {
        UserAccount userAccount = getEntityForAdministration(id);
        validateAdministratorRemoval(userAccount, request.role() == UserRole.ADMIN && request.active());
        validateUsername(userAccount, request.username());
        BoundedBCryptPasswordEncoder.validatePasswordLength(request.password());

        boolean passwordChanged = request.password() != null && !request.password().isBlank();
        boolean accessChanged = !Objects.equals(userAccount.getUsername(), trim(request.username()))
            || userAccount.getRole() != request.role()
            || userAccount.isActive() != request.active()
            || passwordChanged;

        userAccount.setUsername(trim(request.username()));
        userAccount.setFullName(trim(request.fullName()));
        if (passwordChanged) {
            userAccount.setPasswordHash(passwordEncoder.encode(request.password()));
        }
        userAccount.setRole(request.role());
        userAccount.setProfile(legacyProfile(request.role()));
        userAccount.setActive(request.active());

        UserAccountResponse response = UserAccountResponse.from(userAccountRepository.save(userAccount));
        if (accessChanged) {
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
        validateAdministratorRemoval(userAccount, false);
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
        if (userAccount.getRole() != UserRole.TECHNICIAN) {
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
    public UserAccountResponse getCurrentUser(String username) {
        return UserAccountResponse.from(getEntityByUsername(username));
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
        // All reductions take the same ordered locks before locking their target.
        userAccountRepository.findActiveByRoleForUpdate(UserRole.ADMIN);
        return userAccountRepository.findByIdForUpdate(id).orElseThrow(() -> new ResourceNotFoundException("User not found: " + id));
    }

    private void validateAdministratorRemoval(UserAccount account, boolean remainsActiveAdmin) {
        if (account.isActive() && account.getRole() == UserRole.ADMIN && !remainsActiveAdmin
                && userAccountRepository.countByRoleAndActiveTrue(UserRole.ADMIN) <= 1) {
            throw new BusinessException("At least one active administrator must remain.");
        }
    }

    /** Ponte da etapa 8A: enquanto o role existir, o perfil acompanha o role gravado. */
    private AccessProfile legacyProfile(UserRole role) {
        return accessProfileRepository.findByLegacyCode(role.name())
            .orElseThrow(() -> new IllegalStateException("Legacy access profile not found: " + role));
    }

    private String trim(String value) {
        return value == null ? null : value.trim();
    }
}
