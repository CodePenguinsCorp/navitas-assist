package br.com.navitasassist.auth;

import br.com.navitasassist.service.UserAccountService;
import br.com.navitasassist.user.UserAccountResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final UserAccountService userAccountService;

    @GetMapping("/me")
    public UserAccountResponse me(Authentication authentication) {
        return userAccountService.getCurrentUser(authentication.getName());
    }
}
