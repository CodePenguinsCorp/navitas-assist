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
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Recalcula as permissões efetivas a cada requisição das sessões criadas por login ({@link LoginSessionDetails}). Editar
 * perfil ou extras vale na requisição seguinte, sem derrubar a sessão. Se as authorities mudaram, troca a
 * {@link Authentication} (mesmo principal e mesmos detalhes) e grava o contexto na sessão.
 *
 * <p>Não é um bean: é criado em {@code SecurityConfig}, para não ser registrado também como filtro do servlet.
 */
public class EffectiveAuthoritiesFilter extends OncePerRequestFilter {

    private final UserAccountRepository userAccountRepository;
    private final NavitasUserDetailsService userDetailsService;
    private final SecurityContextRepository securityContextRepository;

    public EffectiveAuthoritiesFilter(
        UserAccountRepository userAccountRepository,
        NavitasUserDetailsService userDetailsService,
        SecurityContextRepository securityContextRepository
    ) {
        this.userAccountRepository = userAccountRepository;
        this.userDetailsService = userDetailsService;
        this.securityContextRepository = securityContextRepository;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        Authentication current = SecurityContextHolder.getContext().getAuthentication();
        if (current != null && current.isAuthenticated() && current.getDetails() instanceof LoginSessionDetails) {
            refresh(current, request, response);
        }
        filterChain.doFilter(request, response);
    }

    private void refresh(Authentication current, HttpServletRequest request, HttpServletResponse response) {
        // Sem lock: o perfil e as coleções vêm em selects próprios. Conta ausente fica a cargo da revogação de sessões.
        userAccountRepository.findByUsernameIgnoreCase(current.getName()).ifPresent(account -> {
            String[] recalculated = userDetailsService.authorities(account);
            if (Set.of(recalculated).equals(codes(current.getAuthorities()))) {
                return;
            }
            UsernamePasswordAuthenticationToken replacement = UsernamePasswordAuthenticationToken.authenticated(
                current.getPrincipal(), current.getCredentials(),
                AuthorityUtils.createAuthorityList(recalculated));
            replacement.setDetails(current.getDetails());
            SecurityContext context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(replacement);
            SecurityContextHolder.setContext(context);
            securityContextRepository.saveContext(context, request, response);
        });
    }

    private static Set<String> codes(Collection<? extends GrantedAuthority> authorities) {
        return authorities.stream().map(GrantedAuthority::getAuthority).collect(Collectors.toSet());
    }
}
