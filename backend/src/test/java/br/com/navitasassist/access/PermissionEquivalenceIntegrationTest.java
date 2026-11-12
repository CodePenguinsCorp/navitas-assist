package br.com.navitasassist.access;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Stream;

import br.com.navitasassist.auth.NavitasUserDetailsService;
import br.com.navitasassist.repository.AccessProfileRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/**
 * Rede de segurança da etapa 8A: quem acessa cada endpoint hoje, por perfil. A matriz é literal, copiada das regras de
 * {@code SecurityConfig} antes da troca por permissões, e não deriva do catálogo. Os exemplos usam id inexistente ou
 * corpo inválido, para nunca alterar dados.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PermissionEquivalenceIntegrationTest {

    private static final String ADMIN = "ADMIN";
    private static final String DESK = "SERVICE_DESK";
    private static final String TECH = "TECHNICIAN";
    private static final String VIEWER = "VIEWER";
    private static final List<String> PROFILES = List.of(ADMIN, DESK, TECH, VIEWER);

    private static final Set<String> ALL = Set.of(ADMIN, DESK, TECH, VIEWER);
    private static final Set<String> A = Set.of(ADMIN);
    private static final Set<String> ATV = Set.of(ADMIN, TECH, VIEWER);
    private static final Set<String> AS = Set.of(ADMIN, DESK);
    private static final Set<String> AT = Set.of(ADMIN, TECH);
    private static final Set<String> AST = Set.of(ADMIN, DESK, TECH);
    private static final Set<String> NONE = Set.of();

    private static final String ID = "999999";

    enum Kind { PUBLIC, MAPPED, UNMAPPED }

    record Row(HttpMethod method, String pattern, String samplePath, Set<String> allowed, Kind kind) {
        @Override
        public String toString() {
            return method + " " + pattern;
        }
    }

    private static Row row(HttpMethod method, String pattern, Set<String> allowed) {
        return new Row(method, pattern, sample(pattern), allowed, Kind.MAPPED);
    }

    private static String sample(String pattern) {
        return pattern
            .replace("{eventType}", "INVALID")
            .replace("{code}", "RMA-INEXISTENTE")
            .replaceAll("\\{[A-Za-z]+}", ID);
    }

    static final List<Row> MATRIX = List.of(
        // Públicas
        new Row(HttpMethod.GET, "/health", "/health", ALL, Kind.PUBLIC),
        new Row(HttpMethod.GET, "/api/auth/csrf", "/api/auth/csrf", ALL, Kind.PUBLIC),
        new Row(HttpMethod.POST, "/api/auth/login", "/api/auth/login", ALL, Kind.PUBLIC),

        // Todos (autenticado)
        row(HttpMethod.GET, "/api/auth/me", ALL),
        row(HttpMethod.GET, "/api/clients", ALL),
        row(HttpMethod.GET, "/api/clients/options", ALL),
        row(HttpMethod.GET, "/api/clients/summary", ALL),
        row(HttpMethod.GET, "/api/clients/{id}", ALL),
        row(HttpMethod.GET, "/api/products", ALL),
        row(HttpMethod.GET, "/api/products/options", ALL),
        row(HttpMethod.GET, "/api/products/summary", ALL),
        row(HttpMethod.GET, "/api/products/{id}", ALL),
        row(HttpMethod.GET, "/api/kanban-views", ALL),
        row(HttpMethod.POST, "/api/kanban-views", ALL),
        row(HttpMethod.PUT, "/api/kanban-views/{id}", ALL),
        row(HttpMethod.PATCH, "/api/kanban-views/{id}/default", ALL),
        row(HttpMethod.DELETE, "/api/kanban-views/{id}", ALL),
        row(HttpMethod.GET, "/api/notifications", ALL),
        row(HttpMethod.GET, "/api/notifications/summary", ALL),
        row(HttpMethod.POST, "/api/notifications/{id}/read", ALL),
        row(HttpMethod.POST, "/api/notifications/read-all", ALL),
        row(HttpMethod.POST, "/api/notifications/{id}/snooze", ALL),
        row(HttpMethod.GET, "/api/notifications/preferences", ALL),
        row(HttpMethod.PUT, "/api/notifications/preferences/{eventType}", ALL),
        row(HttpMethod.GET, "/api/parts", ALL),
        row(HttpMethod.GET, "/api/parts/pending", ALL),
        row(HttpMethod.GET, "/api/parts/replenishment", ALL),
        row(HttpMethod.GET, "/api/parts/{id}", ALL),
        row(HttpMethod.GET, "/api/parts/{id}/movements", ALL),
        row(HttpMethod.GET, "/api/protocols/templates", ALL),
        row(HttpMethod.GET, "/api/protocols/templates/{id}", ALL),
        row(HttpMethod.GET, "/api/protocols/rmas/{rmaId}/executions", ALL),
        row(HttpMethod.GET, "/api/rmas", ALL),
        row(HttpMethod.GET, "/api/rmas/summary", ALL),
        row(HttpMethod.GET, "/api/rmas/board", ALL),
        row(HttpMethod.GET, "/api/rmas/history", ALL),
        row(HttpMethod.GET, "/api/rmas/{id}", ALL),
        row(HttpMethod.GET, "/api/rmas/code/{code}", ALL),
        row(HttpMethod.GET, "/api/rmas/{rmaId}/parts", ALL),
        row(HttpMethod.GET, "/api/users/assignable", ALL),

        // Só A
        row(HttpMethod.GET, "/api/notification-rules", A),
        row(HttpMethod.PUT, "/api/notification-rules/{eventType}", A),
        row(HttpMethod.GET, "/api/notification-rules/failures", A),
        row(HttpMethod.GET, "/api/users", A),
        row(HttpMethod.GET, "/api/users/summary", A),
        row(HttpMethod.POST, "/api/users", A),
        row(HttpMethod.PUT, "/api/users/{id}", A),
        row(HttpMethod.DELETE, "/api/users/{id}", A),
        row(HttpMethod.POST, "/api/protocols/templates", A),
        row(HttpMethod.PUT, "/api/protocols/templates/{id}", A),

        // A, T, V
        row(HttpMethod.GET, "/api/reports/rmas", ATV),

        // A, S
        row(HttpMethod.POST, "/api/clients", AS),
        row(HttpMethod.PUT, "/api/clients/{id}", AS),
        row(HttpMethod.DELETE, "/api/clients/{id}", AS),
        row(HttpMethod.POST, "/api/products", AS),
        row(HttpMethod.PUT, "/api/products/{id}", AS),
        row(HttpMethod.DELETE, "/api/products/{id}", AS),
        row(HttpMethod.POST, "/api/rmas", AS),
        row(HttpMethod.PUT, "/api/rmas/{id}", AS),
        row(HttpMethod.PATCH, "/api/rmas/{id}/assignee", AS),
        row(HttpMethod.POST, "/api/parts", AS),
        row(HttpMethod.PUT, "/api/parts/{id}", AS),
        row(HttpMethod.POST, "/api/parts/{id}/movements", AS),
        row(HttpMethod.POST, "/api/parts/movements/{movementId}/reversal", AS),

        // A, T
        row(HttpMethod.PUT, "/api/rmas/{id}/diagnosis", AT),
        row(HttpMethod.POST, "/api/rmas/{rmaId}/parts", AT),
        row(HttpMethod.POST, "/api/rmas/{rmaId}/parts/{reservationId}/allocate", AT),
        row(HttpMethod.POST, "/api/rmas/{rmaId}/parts/{reservationId}/consume", AT),
        row(HttpMethod.POST, "/api/rmas/{rmaId}/parts/{reservationId}/cancel", AT),
        row(HttpMethod.POST, "/api/protocols/rmas/{rmaId}/executions", AT),
        row(HttpMethod.POST, "/api/protocols/executions/{executionId}/items/{itemId}/results", AT),
        row(HttpMethod.POST, "/api/protocols/executions/{executionId}/complete", AT),

        // A, S, T
        row(HttpMethod.PATCH, "/api/rmas/{id}/status", AST),
        row(HttpMethod.PATCH, "/api/rmas/{id}/bulk-status", AST),
        row(HttpMethod.POST, "/api/rmas/{id}/blocks", AST),
        row(HttpMethod.PATCH, "/api/rmas/{id}/blocks/{blockId}", AST),

        // Sem mapeamento de controller
        new Row(HttpMethod.PATCH, "/api/products", "/api/products", A, Kind.UNMAPPED),
        new Row(HttpMethod.DELETE, "/api/protocols/templates/{id}", "/api/protocols/templates/" + ID, NONE, Kind.UNMAPPED)
    );

    @Autowired private MockMvc mvc;
    @Autowired private NavitasUserDetailsService userDetailsService;
    @Autowired private UserAccountRepository users;
    @Autowired private AccessProfileRepository profiles;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired @Qualifier("requestMappingHandlerMapping") private RequestMappingHandlerMapping handlerMapping;

    @BeforeEach
    void createUsers() {
        deleteUsers();
        for (String profile : PROFILES) {
            AccessTestSupport.saveAccount(users, profiles, passwordEncoder, usernameOf(profile), profile);
        }
    }

    @AfterEach
    void deleteUsers() {
        AccessTestSupport.deleteAccounts(users, PROFILES.stream().map(PermissionEquivalenceIntegrationTest::usernameOf).toArray(String[]::new));
    }

    static Stream<Arguments> rowsByProfile() {
        return MATRIX.stream().flatMap(row -> PROFILES.stream().map(profile -> Arguments.of(row, profile)));
    }

    static Stream<Row> protectedRows() {
        return MATRIX.stream().filter(row -> row.kind() != Kind.PUBLIC);
    }

    @ParameterizedTest(name = "{0} como {1}")
    @MethodSource("rowsByProfile")
    void enforcesCurrentAccess(Row row, String profile) throws Exception {
        MockHttpServletRequestBuilder request = build(row)
            .with(user(userDetailsService.loadUserByUsername(usernameOf(profile))))
            .with(csrf());
        int status = mvc.perform(request).andReturn().getResponse().getStatus();
        if (row.allowed().contains(profile)) {
            assertTrue(status != 401 && status != 403, row + " como " + profile + " deveria passar, mas recebeu " + status);
        } else {
            assertEquals(403, status, row + " como " + profile + " deveria ser negado");
        }
    }

    @ParameterizedTest(name = "{0} anônimo")
    @MethodSource("protectedRows")
    void anonymousIsUnauthorized(Row row) throws Exception {
        int status = mvc.perform(build(row).with(csrf())).andReturn().getResponse().getStatus();
        assertEquals(401, status, row + " anônimo");
    }

    @Test
    void everyHandlerMappingIsInMatrix() {
        Set<String> inMatrix = new TreeSet<>();
        MATRIX.stream()
            .filter(row -> row.kind() != Kind.UNMAPPED)
            .forEach(row -> inMatrix.add(row.method() + " " + row.pattern()));

        Set<String> mapped = new TreeSet<>();
        List<String> withoutMethod = new ArrayList<>();
        for (RequestMappingInfo info : handlerMapping.getHandlerMethods().keySet()) {
            Set<String> patterns = info.getPathPatternsCondition() != null
                ? info.getPathPatternsCondition().getPatternValues()
                : info.getPatternValues();
            for (String pattern : patterns) {
                if (pattern.equals("/error")) {
                    continue;
                }
                if (info.getMethodsCondition().getMethods().isEmpty()) {
                    withoutMethod.add(pattern);
                }
                info.getMethodsCondition().getMethods().forEach(method -> mapped.add(method.name() + " " + pattern));
            }
        }

        assertTrue(withoutMethod.isEmpty(), "Mapeamentos sem método HTTP: " + withoutMethod);
        Set<String> missing = new TreeSet<>(mapped);
        missing.removeAll(inMatrix);
        assertTrue(missing.isEmpty(), "Endpoints fora da matriz: " + missing);
        Set<String> stale = new TreeSet<>(inMatrix);
        stale.removeAll(mapped);
        assertTrue(stale.isEmpty(), "Linhas MAPPED/PUBLIC sem mapeamento de controller: " + stale);
        assertEquals(76, mapped.size(), "Total de mapeamentos de controller");
    }

    private static MockHttpServletRequestBuilder build(Row row) {
        MockHttpServletRequestBuilder builder = request(row.method(), row.samplePath());
        if (row.method() == HttpMethod.POST || row.method() == HttpMethod.PUT || row.method() == HttpMethod.PATCH) {
            builder.contentType(MediaType.APPLICATION_JSON).content("{}");
        }
        return builder;
    }

    private static String usernameOf(String profile) {
        return switch (profile) {
            case ADMIN -> "equiv.admin";
            case DESK -> "equiv.desk";
            case TECH -> "equiv.tech";
            case VIEWER -> "equiv.viewer";
            default -> throw new IllegalArgumentException(profile);
        };
    }
}
