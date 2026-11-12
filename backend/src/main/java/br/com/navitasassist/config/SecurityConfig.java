package br.com.navitasassist.config;

import jakarta.servlet.http.HttpServletResponse;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authorization.AuthorityAuthorizationManager;
import org.springframework.security.authorization.AuthorizationManagers;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import br.com.navitasassist.access.Permission.Codes;
import br.com.navitasassist.auth.BoundedBCryptPasswordEncoder;
import br.com.navitasassist.auth.EffectiveAuthoritiesFilter;
import br.com.navitasassist.auth.NavitasUserDetailsService;
import br.com.navitasassist.repository.UserAccountRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.core.session.SessionRegistryImpl;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.authentication.logout.CookieClearingLogoutHandler;
import org.springframework.security.web.authentication.logout.LogoutHandler;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.security.web.authentication.session.SessionAuthenticationException;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.session.ConcurrentSessionFilter;
import org.springframework.security.web.session.HttpSessionEventPublisher;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    @Value("${navitas.security.cookie-secure:true}")
    private boolean secureCookies;

    @Bean
    public SecurityFilterChain securityFilterChain(
        HttpSecurity http,
        SecurityContextRepository securityContextRepository,
        CsrfTokenRepository csrfTokenRepository,
        SessionRegistry sessionRegistry,
        UserAccountRepository userAccountRepository,
        NavitasUserDetailsService userDetailsService
    ) throws Exception {
        LogoutHandler unregisterSession = (request, response, authentication) -> {
            var session = request.getSession(false);
            if (session != null) {
                sessionRegistry.removeSessionInformation(session.getId());
            }
        };
        ConcurrentSessionFilter expiredSessions = new ConcurrentSessionFilter(sessionRegistry, event ->
            restAuthenticationEntryPoint().commence(event.getRequest(), event.getResponse(),
                new SessionAuthenticationException("Session expired")));
        expiredSessions.setLogoutHandlers(List.of(unregisterSession, new SecurityContextLogoutHandler(),
            new CookieClearingLogoutHandler("JSESSIONID", "XSRF-TOKEN")));

        http
            .addFilterBefore(expiredSessions, CsrfFilter.class)
            // D8: permissões recalculadas a cada requisição das sessões de login, sem derrubá-las.
            .addFilterAfter(new EffectiveAuthoritiesFilter(userAccountRepository, userDetailsService, securityContextRepository,
                sessionRegistry), ConcurrentSessionFilter.class)
            .csrf(csrf -> csrf
                .csrfTokenRepository(csrfTokenRepository)
                .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()))
            .securityContext(context -> context
                .securityContextRepository(securityContextRepository)
                .requireExplicitSave(true))
            .sessionManagement(session -> session
                .sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED)
                .sessionFixation(fixation -> fixation.changeSessionId()))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/health").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/auth/csrf").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/auth/login").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/users/assignable").authenticated()
                .requestMatchers("/api/kanban-views/**").authenticated()
                .requestMatchers("/api/notifications/**").authenticated()
                .requestMatchers("/api/notification-rules/**").hasAuthority(Codes.NOTIFICACOES_REGRAS)
                .requestMatchers("/api/users/**").hasAuthority(Codes.USUARIOS_GERIR)
                .requestMatchers(HttpMethod.GET, "/api/reports/rmas").hasAuthority(Codes.RELATORIOS_VER)
                // D2: leituras auxiliares (dashboard, relatórios, RMAs e painéis) seguem abertas a quem tem login.
                .requestMatchers(HttpMethod.GET, "/api/auth/me", "/api/clients/**", "/api/products/**").authenticated()
                .requestMatchers(HttpMethod.GET, "/api/rmas/**").hasAuthority(Codes.RMA_VER)
                .requestMatchers(HttpMethod.POST, "/api/auth/logout").authenticated()
                .requestMatchers(HttpMethod.POST, "/api/clients", "/api/products").hasAuthority(Codes.CADASTROS_EDITAR)
                .requestMatchers(HttpMethod.POST, "/api/rmas").hasAuthority(Codes.RMA_ABRIR)
                .requestMatchers(HttpMethod.PUT, "/api/rmas/*/diagnosis").hasAuthority(Codes.RMA_DIAGNOSTICAR)
                .requestMatchers(HttpMethod.PATCH, "/api/rmas/*/status", "/api/rmas/*/bulk-status").hasAuthority(Codes.RMA_STATUS)
                .requestMatchers(HttpMethod.PATCH, "/api/rmas/*/assignee").hasAuthority(Codes.RMA_RESPONSAVEL)
                .requestMatchers(HttpMethod.GET, "/api/parts/**").authenticated()
                .requestMatchers(HttpMethod.POST, "/api/rmas/*/parts", "/api/rmas/*/parts/*/*").hasAuthority(Codes.PECAS_RESERVAR)
                .requestMatchers(HttpMethod.POST, "/api/parts", "/api/parts/*/movements", "/api/parts/movements/*/reversal").hasAuthority(Codes.PECAS_MOVIMENTAR)
                .requestMatchers(HttpMethod.PUT, "/api/parts/*").hasAuthority(Codes.PECAS_MOVIMENTAR)
                .requestMatchers(HttpMethod.POST, "/api/rmas/*/blocks").hasAuthority(Codes.RMA_IMPEDIMENTOS)
                .requestMatchers(HttpMethod.PATCH, "/api/rmas/*/blocks/*").hasAuthority(Codes.RMA_IMPEDIMENTOS)
                .requestMatchers(HttpMethod.PUT, "/api/clients/*", "/api/products/*").hasAuthority(Codes.CADASTROS_EDITAR)
                .requestMatchers(HttpMethod.PUT, "/api/rmas/*").hasAuthority(Codes.RMA_EDITAR)
                .requestMatchers(HttpMethod.DELETE, "/api/clients/*", "/api/products/*").hasAuthority(Codes.CADASTROS_EDITAR)
                .requestMatchers(HttpMethod.GET, "/api/protocols/**").authenticated()
                .requestMatchers(HttpMethod.POST, "/api/protocols/templates").hasAuthority(Codes.PROTOCOLOS_CATALOGO)
                .requestMatchers(HttpMethod.PUT, "/api/protocols/templates/*").hasAuthority(Codes.PROTOCOLOS_CATALOGO)
                .requestMatchers(HttpMethod.POST, "/api/protocols/rmas/*/executions", "/api/protocols/executions/*/items/*/results", "/api/protocols/executions/*/complete").hasAuthority(Codes.PROTOCOLOS_EXECUTAR)
                .requestMatchers("/api/protocols/**").denyAll()
                .requestMatchers(HttpMethod.GET, "/api/profiles/options").hasAnyAuthority(Codes.PERFIS_GERIR, Codes.USUARIOS_GERIR, Codes.NOTIFICACOES_REGRAS)
                .requestMatchers(HttpMethod.GET, "/api/permissions").hasAnyAuthority(Codes.PERFIS_GERIR, Codes.USUARIOS_GERIR)
                .requestMatchers("/api/profiles/**").hasAuthority(Codes.PERFIS_GERIR)
                // D3: rotas não classificadas exigem as duas permissões de administrador.
                .requestMatchers("/api/**").access(AuthorizationManagers.allOf(
                    AuthorityAuthorizationManager.hasAuthority(Codes.USUARIOS_GERIR),
                    AuthorityAuthorizationManager.hasAuthority(Codes.PERFIS_GERIR)))
                .anyRequest().authenticated())
            .exceptionHandling(exception -> exception
                .authenticationEntryPoint(restAuthenticationEntryPoint())
                .accessDeniedHandler(restAccessDeniedHandler()))
            .logout(logout -> logout
                .logoutUrl("/api/auth/logout")
                .addLogoutHandler(unregisterSession)
                .deleteCookies("JSESSIONID", "XSRF-TOKEN")
                .logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT)));

        return http.build();
    }

    @Bean
    public SessionRegistry sessionRegistry() {
        return new SessionRegistryImpl();
    }

    @Bean
    public HttpSessionEventPublisher httpSessionEventPublisher() {
        return new HttpSessionEventPublisher();
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration configuration) throws Exception {
        return configuration.getAuthenticationManager();
    }

    @Bean
    public SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }

    @Bean
    public CsrfTokenRepository csrfTokenRepository() {
        CookieCsrfTokenRepository repository = CookieCsrfTokenRepository.withHttpOnlyFalse();
        repository.setCookieCustomizer(cookie -> cookie.path("/").sameSite("Strict").secure(secureCookies));
        return repository;
    }

    @Bean
    public AuthenticationEntryPoint restAuthenticationEntryPoint() {
        return (request, response, authException) -> {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write("""
                {"message":"Unauthorized"}
                """);
        };
    }

    @Bean
    public AccessDeniedHandler restAccessDeniedHandler() {
        return (request, response, accessDeniedException) -> {
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write("""
                {"message":"Forbidden"}
                """);
        };
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BoundedBCryptPasswordEncoder();
    }
}
