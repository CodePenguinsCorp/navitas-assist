package br.com.navitasassist.service;

import java.util.List;

import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.controller.ResourceNotFoundException;
import br.com.navitasassist.pagination.PageParams;
import br.com.navitasassist.pagination.PageResponse;
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
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class UserAccountService {

    private final UserAccountRepository userAccountRepository;
    private final RmaRecordRepository rmaRecordRepository;
    private final PasswordEncoder passwordEncoder;

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
        userAccount.setActive(request.active());

        return UserAccountResponse.from(userAccountRepository.save(userAccount));
    }

    public UserAccountResponse update(Long id, UserAccountUpdateRequest request) {
        UserAccount userAccount = getEntityById(id);
        validateUsername(userAccount, request.username());

        userAccount.setUsername(trim(request.username()));
        userAccount.setFullName(trim(request.fullName()));
        if (request.password() != null && !request.password().isBlank()) {
            userAccount.setPasswordHash(passwordEncoder.encode(request.password()));
        }
        userAccount.setRole(request.role());
        userAccount.setActive(request.active());

        return UserAccountResponse.from(userAccountRepository.save(userAccount));
    }

    public void delete(Long id, String authenticatedUsername) {
        UserAccount userAccount = getEntityById(id);

        if (userAccount.getUsername().equalsIgnoreCase(authenticatedUsername)) {
            throw new BusinessException("You cannot delete your own user account.");
        }
        if (rmaRecordRepository.existsByAssignee_Id(id)) {
            throw new BusinessException("User is assigned to one or more RMAs and cannot be deleted.");
        }

        userAccountRepository.delete(userAccount);
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
        boolean duplicate = userAccountRepository.existsByUsernameIgnoreCase(username)
            && (existing == null || !existing.getUsername().equalsIgnoreCase(username));

        if (duplicate) {
            throw new BusinessException("Username already registered: " + username);
        }
    }

    private String trim(String value) {
        return value == null ? null : value.trim();
    }
}
