package br.com.navitasassist.auth;

import java.util.Map;

import br.com.navitasassist.service.UserAccountService;
import br.com.navitasassist.user.CurrentUserResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.transaction.annotation.Transactional;
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
    private final AuthenticationManager authenticationManager;
    private final SecurityContextRepository securityContextRepository;
    private final CsrfTokenRepository csrfTokenRepository;
    private final SessionRegistry sessionRegistry;

    @GetMapping("/csrf")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void csrf(HttpServletRequest request, HttpServletResponse response) {
        csrfTokenRepository.loadDeferredToken(request, response).get();
    }

    @PostMapping("/login")
    @Transactional
    public CurrentUserResponse login(
        @Valid @RequestBody LoginRequest loginRequest,
        HttpServletRequest request,
        HttpServletResponse response
    ) {
        Authentication authentication;
        String username = loginRequest.username().trim().toLowerCase(java.util.Locale.ROOT).replaceAll("[\\r\\n\\t]", "_");
        username = username.substring(0, Math.min(60, username.length()));
        try {
            authentication = authenticationManager.authenticate(
                UsernamePasswordAuthenticationToken.unauthenticated(loginRequest.username().trim(), loginRequest.password()));
        } catch (AuthenticationException failure) {
            log.warn("action=LOGIN_FAILURE username={} ip={}", username, request.getRemoteAddr());
            throw failure;
        }
        CurrentUserResponse user = userAccountService.getCurrentUser(authentication.getName());

        if (request.getSession(false) != null) {
            sessionRegistry.removeSessionInformation(request.getSession(false).getId());
            request.changeSessionId();
        }

        // Marca a sessão como criada por login real: só ela tem as permissões recalculadas a cada requisição.
        UsernamePasswordAuthenticationToken loginSession = UsernamePasswordAuthenticationToken.authenticated(
            authentication.getPrincipal(), null, authentication.getAuthorities());
        loginSession.setDetails(new LoginSessionDetails(user.id(), request.getRemoteAddr()));

        SecurityContext securityContext = SecurityContextHolder.createEmptyContext();
        securityContext.setAuthentication(loginSession);
        SecurityContextHolder.setContext(securityContext);
        securityContextRepository.saveContext(securityContext, request, response);
        sessionRegistry.registerNewSession(request.getSession().getId(), user.id());
        log.info("action=LOGIN_SUCCESS username={} ip={}", username, request.getRemoteAddr());
        return user;
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
