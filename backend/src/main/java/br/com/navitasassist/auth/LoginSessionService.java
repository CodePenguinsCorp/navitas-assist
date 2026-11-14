package br.com.navitasassist.auth;

import br.com.navitasassist.service.UserAccountService;
import br.com.navitasassist.user.CurrentUserResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class LoginSessionService {
    private final UserAccountService userAccountService;
    private final AuthenticationManager authenticationManager;
    private final SecurityContextRepository securityContextRepository;
    private final CsrfTokenRepository csrfTokenRepository;
    private final SessionRegistry sessionRegistry;

    @Transactional
    public CurrentUserResponse login(LoginRequest loginRequest, HttpServletRequest request, HttpServletResponse response) {
        Authentication authentication = authenticationManager.authenticate(
            UsernamePasswordAuthenticationToken.unauthenticated(loginRequest.username().trim(), loginRequest.password()));
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
        csrfTokenRepository.saveToken(csrfTokenRepository.generateToken(request), request, response);
        return user;
    }
}
