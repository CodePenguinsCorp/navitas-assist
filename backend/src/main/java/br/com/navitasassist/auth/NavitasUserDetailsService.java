package br.com.navitasassist.auth;

import br.com.navitasassist.access.Permission;
import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.service.EffectivePermissionService;
import br.com.navitasassist.user.UserAccount;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class NavitasUserDetailsService implements UserDetailsService {

    private final UserAccountRepository userAccountRepository;
    private final EffectivePermissionService effectivePermissionService;

    @Override
    @Transactional
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        // Login holds this lock until the authenticated session has been registered. The query locks only the
        // user_accounts row; profile and collections are loaded by their own selects, without locks.
        UserAccount userAccount = userAccountRepository.findByUsernameIgnoreCaseForUpdate(username)
            .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username));

        return User.builder()
            .username(userAccount.getUsername())
            .password(userAccount.getPasswordHash())
            .authorities(authorities(userAccount))
            .disabled(!userAccount.isActive())
            .build();
    }

    /** Códigos das permissões efetivas, sem {@code ROLE_*}. */
    public String[] authorities(UserAccount userAccount) {
        return Permission.codes(effectivePermissionService.effectivePermissions(userAccount)).toArray(String[]::new);
    }
}
