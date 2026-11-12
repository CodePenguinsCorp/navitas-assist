package br.com.navitasassist.access;

import static br.com.navitasassist.access.AccessTestSupport.asProfile;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;

import br.com.navitasassist.auth.LoginSessionDetails;
import br.com.navitasassist.repository.AccessProfileRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.user.UserAccount;
import br.com.navitasassist.user.UserAccountTestSupport;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** D8: as permissões são recalculadas a cada requisição de uma sessão de login real, sem derrubar a sessão. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class EffectiveAuthoritiesFilterIntegrationTest {

    private static final String TECH = "filter.tech";
    private static final String VIEWER = "filter.viewer";
    private static final String TECH_PROFILE = "Teste filtro: técnico";
    private static final String VIEWER_PROFILE = "Teste filtro: consulta";

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private UserAccountRepository users;
    @Autowired private AccessProfileRepository profiles;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private SessionRegistry sessionRegistry;
    private final List<MockHttpSession> sessions = new ArrayList<>();

    @BeforeEach
    void prepare() {
        cleanup();
        UserAccountTestSupport.ensureAdmin(users, profiles, passwordEncoder);
        AccessProfile tech = AccessTestSupport.saveProfile(profiles, TECH_PROFILE,
            LegacyProfiles.authorities("TECHNICIAN"));
        AccessTestSupport.saveAccountWithProfile(users, passwordEncoder, TECH, tech, Set.of());
        AccessProfile viewer = AccessTestSupport.saveProfile(profiles, VIEWER_PROFILE,
            LegacyProfiles.authorities("VIEWER"));
        AccessTestSupport.saveAccountWithProfile(users, passwordEncoder, VIEWER, viewer, Set.of());
    }

    @AfterEach
    void cleanup() {
        for (MockHttpSession session : sessions) {
            sessionRegistry.removeSessionInformation(session.getId());
            if (!session.isInvalid()) session.invalidate();
        }
        sessions.clear();
        AccessTestSupport.deleteAccounts(users, TECH, VIEWER);
        AccessTestSupport.deleteProfiles(profiles, TECH_PROFILE, VIEWER_PROFILE);
    }

    @Test
    void profileChangeAppliesOnNextRequestWithoutLogout() throws Exception {
        MockHttpSession session = login(TECH);
        assertNotForbidden(diagnosis(session));

        AccessProfile profile = profiles.findByNameIgnoreCase(TECH_PROFILE).orElseThrow();
        profile.getPermissions().remove("rma.diagnosticar");
        profiles.saveAndFlush(profile);

        assertEquals(403, diagnosis(session));
        mvc.perform(get("/api/auth/me").session(session)).andExpect(status().isOk());
        assertTrue(!session.isInvalid());
    }

    @Test
    void grantingPermissionAppliesOnNextRequest() throws Exception {
        MockHttpSession session = login(VIEWER);
        assertEquals(403, openRma(session));

        UserAccount account = users.findByUsernameIgnoreCase(VIEWER).orElseThrow();
        account.setExtraPermissions(new HashSet<>(Set.of("rma.abrir")));
        users.saveAndFlush(account);

        assertNotForbidden(openRma(session));
    }

    @Test
    void recalculatedAuthoritiesAreSavedInTheSession() throws Exception {
        MockHttpSession session = login(VIEWER);
        UserAccount account = users.findByUsernameIgnoreCase(VIEWER).orElseThrow();
        account.setExtraPermissions(new HashSet<>(Set.of("rma.abrir")));
        users.saveAndFlush(account);

        mvc.perform(get("/api/auth/me").session(session)).andExpect(status().isOk());

        SecurityContext context = (SecurityContext) session.getAttribute(
            HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY);
        assertNotNull(context);
        assertEquals(new TreeSet<>(Set.of("rma.ver", "cadastros.ver", "pecas.ver", "protocolos.ver", "relatorios.ver", "rma.abrir")),
            context.getAuthentication().getAuthorities().stream().map(GrantedAuthority::getAuthority)
                .collect(Collectors.toCollection(TreeSet::new)));
        assertTrue(context.getAuthentication().getDetails() instanceof LoginSessionDetails, "detalhes preservados");
        assertEquals(VIEWER, context.getAuthentication().getName());
    }

    @Test
    void loginMarksSessionWithLoginSessionDetails() throws Exception {
        MockHttpSession session = login(TECH);
        SecurityContext context = (SecurityContext) session.getAttribute(
            HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY);
        assertNotNull(context);
        assertTrue(context.getAuthentication().getDetails() instanceof LoginSessionDetails);
    }

    @Test
    void mockUsersAreNotRecalculated() throws Exception {
        // Existe um "admin" no banco com o perfil Administrador; o principal de teste não traz LoginSessionDetails.
        mvc.perform(get("/api/users").with(asProfile("admin", "VIEWER"))).andExpect(status().isForbidden());
    }

    private int diagnosis(MockHttpSession session) throws Exception {
        return mvc.perform(put("/api/rmas/999999/diagnosis").session(session).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content("{}")).andReturn().getResponse().getStatus();
    }

    private int openRma(MockHttpSession session) throws Exception {
        return mvc.perform(post("/api/rmas").session(session).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content("{}")).andReturn().getResponse().getStatus();
    }

    private static void assertNotForbidden(int status) {
        assertTrue(status != 401 && status != 403, "esperava acesso liberado, recebeu " + status);
    }

    private MockHttpSession login(String username) throws Exception {
        var result = mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("username", username, "password", AccessTestSupport.DEFAULT_PASSWORD))))
            .andExpect(status().isOk()).andReturn();
        MockHttpSession session = (MockHttpSession) result.getRequest().getSession(false);
        assertNotNull(session);
        sessions.add(session);
        return session;
    }
}
