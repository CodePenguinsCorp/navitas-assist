package br.com.navitasassist.service;

import java.util.List;

import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.controller.ResourceNotFoundException;
import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.user.UserAccount;
import br.com.navitasassist.user.UserAccountRequest;
import br.com.navitasassist.user.UserAccountResponse;
import br.com.navitasassist.user.UserAccountUpdateRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class UserAccountService {

    private final UserAccountRepository userAccountRepository;
    private final PasswordEncoder passwordEncoder;

    @Transactional(readOnly = true)
    public List<UserAccountResponse> listAll() {
        return userAccountRepository.findAll().stream().map(UserAccountResponse::from).toList();
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

        userAccountRepository.delete(userAccount);
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
