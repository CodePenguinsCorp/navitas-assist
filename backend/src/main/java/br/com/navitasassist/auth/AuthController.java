package br.com.navitasassist.auth;

import java.util.Map;

import br.com.navitasassist.service.UserAccountService;
import br.com.navitasassist.user.CurrentUserResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@lombok.extern.slf4j.Slf4j
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final UserAccountService userAccountService;
    private final CsrfTokenRepository csrfTokenRepository;
    private final LoginSessionService loginSessionService;
    private final LoginAttemptDelay loginAttemptDelay;

    @GetMapping("/csrf")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void csrf(HttpServletRequest request, HttpServletResponse response) {
        csrfTokenRepository.loadDeferredToken(request, response).get();
    }

    @PostMapping("/login")
    public CurrentUserResponse login(
        @Valid @RequestBody LoginRequest loginRequest,
        HttpServletRequest request,
        HttpServletResponse response
    ) {
        String username = loginRequest.username().trim().toLowerCase(java.util.Locale.ROOT).replaceAll("[\\r\\n\\t]", "_");
        username = username.substring(0, Math.min(60, username.length()));
        try {
            CurrentUserResponse user = loginSessionService.login(loginRequest, request, response);
            loginAttemptDelay.succeeded(loginRequest.username(), request.getRemoteAddr());
            log.info("action=LOGIN_SUCCESS username={} ip={}", username, request.getRemoteAddr());
            return user;
        } catch (AuthenticationException failure) {
            log.warn("action=LOGIN_FAILURE username={} ip={}", username, request.getRemoteAddr());
            long delayMillis = loginAttemptDelay.failed(loginRequest.username(), request.getRemoteAddr()).toMillis();
            try { Thread.sleep(delayMillis); }
            catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
            throw failure;
        }
    }

    @GetMapping("/me")
    public CurrentUserResponse me(Authentication authentication) {
        return userAccountService.getCurrentUser(authentication.getName());
    }

    @ExceptionHandler(AuthenticationException.class)
    @ResponseStatus(HttpStatus.UNAUTHORIZED)
    public Map<String, String> handleAuthenticationFailure() {
        return Map.of("message", "Usuário ou senha inválidos.");
    }
}
