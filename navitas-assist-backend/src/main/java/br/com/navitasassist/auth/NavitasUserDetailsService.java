package br.com.navitasassist.auth;

import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.user.UserAccount;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class NavitasUserDetailsService implements UserDetailsService {

    private final UserAccountRepository userAccountRepository;

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        UserAccount userAccount = userAccountRepository.findByUsernameIgnoreCase(username)
            .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username));

        return User.builder()
            .username(userAccount.getUsername())
            .password(userAccount.getPasswordHash())
            .roles(userAccount.getRole().name())
            .disabled(!userAccount.isActive())
            .build();
    }
}
