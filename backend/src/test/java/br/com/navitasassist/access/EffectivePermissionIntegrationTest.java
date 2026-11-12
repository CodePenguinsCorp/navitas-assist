package br.com.navitasassist.access;

import static org.hamcrest.Matchers.greaterThan;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;

import br.com.navitasassist.auth.NavitasUserDetailsService;
import br.com.navitasassist.repository.AccessProfileRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class EffectivePermissionIntegrationTest {

    private static final String VIEWER_EXTRA = "effective.viewer.extra";
    private static final String REPORTS_ONLY = "effective.reports.only";
    private static final String REPORTS_PROFILE = "Teste efetivo: só relatórios";

    @Autowired private MockMvc mvc;
    @Autowired private NavitasUserDetailsService userDetailsService;
    @Autowired private UserAccountRepository users;
    @Autowired private AccessProfileRepository profiles;
    @Autowired private PasswordEncoder passwordEncoder;

    @BeforeEach
    void prepare() {
        cleanup();
        AccessProfile viewer = profiles.findByLegacyCode("VIEWER").orElseThrow();
        AccessTestSupport.saveAccountWithProfile(users, passwordEncoder, VIEWER_EXTRA, viewer, Set.of("rma.abrir"));
        AccessProfile reportsOnly = AccessTestSupport.saveProfile(profiles, REPORTS_PROFILE, "relatorios.ver");
        AccessTestSupport.saveAccountWithProfile(users, passwordEncoder, REPORTS_ONLY, reportsOnly, Set.of());
    }

    @AfterEach
    void cleanup() {
        AccessTestSupport.deleteAccounts(users, VIEWER_EXTRA, REPORTS_ONLY);
        AccessTestSupport.deleteProfiles(profiles, REPORTS_PROFILE);
    }

    @Test
    void viewerWithExtraCanOpenRma() throws Exception {
        int status = mvc.perform(post("/api/rmas").with(as(VIEWER_EXTRA)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andReturn().getResponse().getStatus();

        assertTrue(status != 401 && status != 403, "Consulta + extra rma.abrir deveria abrir RMA, mas recebeu " + status);
        mvc.perform(putJson("/api/rmas/999999").with(as(VIEWER_EXTRA)))
            .andExpect(status().isForbidden());
    }

    @Test
    void customProfileOnlyReports() throws Exception {
        mvc.perform(get("/api/reports/rmas").with(as(REPORTS_ONLY))).andExpect(status().isOk());
        mvc.perform(get("/api/rmas").with(as(REPORTS_ONLY))).andExpect(status().isForbidden());
        // D2: as leituras auxiliares continuam abertas a qualquer usuário autenticado.
        mvc.perform(get("/api/clients").with(as(REPORTS_ONLY))).andExpect(status().isOk());
        mvc.perform(get("/api/parts").with(as(REPORTS_ONLY))).andExpect(status().isOk());
        mvc.perform(get("/api/protocols/templates").with(as(REPORTS_ONLY))).andExpect(status().isOk());
    }

    @Test
    void customProfileWithoutRmaVerSeesNoNotifications() throws Exception {
        mvc.perform(get("/api/notifications/preferences").with(as(VIEWER_EXTRA)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(greaterThan(0)));
        mvc.perform(get("/api/notifications/preferences").with(as(REPORTS_ONLY)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/notifications/summary").with(as(REPORTS_ONLY)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.unread").value(0));
    }

    @Test
    void authoritiesAreExactlyEffectiveCodes() {
        assertEquals(new TreeSet<>(Set.of("rma.ver", "cadastros.ver", "pecas.ver", "protocolos.ver", "relatorios.ver", "rma.abrir")),
            authorities(VIEWER_EXTRA));
        assertEquals(Set.of("relatorios.ver"), authorities(REPORTS_ONLY));
    }

    @Test
    void legacyProfilesMatchMigratedSeed() {
        assertEquals(Set.of("ADMIN", "SERVICE_DESK", "TECHNICIAN", "VIEWER"), LegacyProfiles.PERMISSIONS.keySet());
        LegacyProfiles.PERMISSIONS.forEach((code, expected) ->
            assertEquals(expected, profiles.findByLegacyCode(code).orElseThrow().getPermissions(), "Seed do perfil " + code));
    }

    private Set<String> authorities(String username) {
        UserDetails details = userDetailsService.loadUserByUsername(username);
        return details.getAuthorities().stream().map(GrantedAuthority::getAuthority).collect(Collectors.toCollection(TreeSet::new));
    }

    private RequestPostProcessor as(String username) {
        return user(userDetailsService.loadUserByUsername(username));
    }

    private static MockHttpServletRequestBuilder putJson(String path) {
        return MockMvcRequestBuilders.put(path).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}");
    }
}
