package br.com.navitasassist.auth;

import java.io.IOException;
import java.util.Collection;
import java.util.Set;
import java.util.stream.Collectors;

import br.com.navitasassist.repository.UserAccountRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Recalcula as permissões efetivas a cada requisição das sessões criadas por login ({@link LoginSessionDetails}). Editar
 * perfil ou extras vale na requisição seguinte, sem derrubar a sessão. Se as authorities mudaram, troca a
 * {@link Authentication} (mesmo principal e mesmos detalhes) e grava o contexto na sessão.
 *
 * <p>A conta é lida pelo id gravado no login, numa só consulta. Se ela não existe mais ou está inativa, a sessão é
 * encerrada e a requisição segue anônima (401 nas rotas protegidas), mesmo que a mudança não tenha passado pela API.
 *
 * <p>Roda depois do {@code ConcurrentSessionFilter}: sessão expirada não chega a ser recalculada.
 *
 * <p>Não é um bean: é criado em {@code SecurityConfig}, para não ser registrado também como filtro do servlet.
 */
public class EffectiveAuthoritiesFilter extends OncePerRequestFilter {

    private final UserAccountRepository userAccountRepository;
    private final NavitasUserDetailsService userDetailsService;
    private final SecurityContextRepository securityContextRepository;
    private final SessionRegistry sessionRegistry;

    public EffectiveAuthoritiesFilter(
        UserAccountRepository userAccountRepository,
        NavitasUserDetailsService userDetailsService,
        SecurityContextRepository securityContextRepository,
        SessionRegistry sessionRegistry
    ) {
        this.userAccountRepository = userAccountRepository;
        this.userDetailsService = userDetailsService;
        this.securityContextRepository = securityContextRepository;
        this.sessionRegistry = sessionRegistry;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        Authentication current = SecurityContextHolder.getContext().getAuthentication();
        if (current != null && current.isAuthenticated() && current.getDetails() instanceof LoginSessionDetails details) {
            refresh(current, details, request, response);
        }
        filterChain.doFilter(request, response);
    }

    private void refresh(Authentication current, LoginSessionDetails details, HttpServletRequest request, HttpServletResponse response) {
        // Sem lock, numa só consulta (conta, perfil e coleções).
        var account = details.userId() == null ? null : userAccountRepository.findWithAccessById(details.userId()).orElse(null);
        if (account == null || !account.isActive()) {
            endSession(request);
            return;
        }
        String[] recalculated = userDetailsService.authorities(account);
        if (!Set.of(recalculated).equals(codes(current.getAuthorities()))) {
            UsernamePasswordAuthenticationToken replacement = UsernamePasswordAuthenticationToken.authenticated(
                current.getPrincipal(), current.getCredentials(),
                AuthorityUtils.createAuthorityList(recalculated));
            replacement.setDetails(current.getDetails());
            SecurityContext context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(replacement);
            SecurityContextHolder.setContext(context);
            securityContextRepository.saveContext(context, request, response);
        }
    }

    /** Conta apagada ou desativada fora da API: encerra a sessão e segue como anônimo. */
    private void endSession(HttpServletRequest request) {
        SecurityContextHolder.clearContext();
        HttpSession session = request.getSession(false);
        if (session != null) {
            sessionRegistry.removeSessionInformation(session.getId());
            session.invalidate();
        }
    }

    private static Set<String> codes(Collection<? extends GrantedAuthority> authorities) {
        return authorities.stream().map(GrantedAuthority::getAuthority).collect(Collectors.toSet());
    }
}
