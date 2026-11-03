package br.com.navitasassist.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.user.UserAccount;
import br.com.navitasassist.user.UserRole;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
class AuthSecurityIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserAccountRepository userAccountRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @BeforeEach
    void createRoleUsers() {
        userAccountRepository.findAll().stream()
            .filter(user -> !user.getUsername().equalsIgnoreCase("admin"))
            .forEach(userAccountRepository::delete);
        createUser("service.desk", UserRole.SERVICE_DESK);
        createUser("technician", UserRole.TECHNICIAN);
        createUser("viewer", UserRole.VIEWER);
    }

    @Test
    void csrfBootstrapShouldCreateUsableCookieWithoutBodyOrSession() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/auth/csrf"))
            .andExpect(status().isNoContent())
            .andExpect(content().string(""))
            .andExpect(cookie().exists("XSRF-TOKEN"))
            .andExpect(cookie().path("XSRF-TOKEN", "/"))
            .andExpect(cookie().httpOnly("XSRF-TOKEN", false))
            .andExpect(cookie().secure("XSRF-TOKEN", false))
            .andReturn();

        Cookie token = result.getResponse().getCookie("XSRF-TOKEN");
        assertNotNull(token);
        assertEquals("Strict", token.getAttribute("SameSite"));
        assertNull(result.getRequest().getSession(false));
        mockMvc.perform(post("/api/auth/login")
                .with(csrfCookie(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"admin\",\"password\":\"admin123\"}"))
            .andExpect(status().isOk());
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void csrfBootstrapShouldPreserveCookieForAnonymousAndAuthenticatedRequests(boolean authenticated) throws Exception {
        Cookie token = requestCsrfCookie();
        var request = get("/api/auth/csrf").cookie(token);
        if (authenticated) {
            request.with(user("viewer").roles("VIEWER"));
        }

        mockMvc.perform(request)
            .andExpect(status().isNoContent())
            .andExpect(content().string(""))
            .andExpect(cookie().doesNotExist("XSRF-TOKEN"));
    }

    @Test
    void anotherTabBootstrapShouldNotInvalidatePreparedLoginHeader() throws Exception {
        Cookie browserCookie = requestCsrfCookie();
        String preparedHeader = browserCookie.getValue();

        for (int tab = 0; tab < 2; tab++) {
            Cookie replacement = mockMvc.perform(get("/api/auth/csrf").cookie(browserCookie))
                .andExpect(status().isNoContent())
                .andReturn().getResponse().getCookie("XSRF-TOKEN");
            if (replacement != null) {
                browserCookie = replacement;
            }
        }

        MvcResult login = mockMvc.perform(post("/api/auth/login")
                .cookie(browserCookie)
                .header("X-XSRF-TOKEN", preparedHeader)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"admin\",\"password\":\"admin123\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.username").value("admin"))
            .andReturn();

        MockHttpSession session = (MockHttpSession) login.getRequest().getSession(false);
        assertNotNull(session);
        mockMvc.perform(get("/api/auth/me").session(session))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.username").value("admin"));
    }

    @Test
    void csrfBootstrapShouldGenerateUsableTokenAfterLogoutRemovesCookie() throws Exception {
        Cookie original = requestCsrfCookie();
        MvcResult login = mockMvc.perform(post("/api/auth/login")
                .with(csrfCookie(original))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"admin\",\"password\":\"admin123\"}"))
            .andExpect(status().isOk())
            .andReturn();
        MockHttpSession session = (MockHttpSession) login.getRequest().getSession(false);
        assertNotNull(session);

        mockMvc.perform(post("/api/auth/logout").session(session).with(csrfCookie(original)))
            .andExpect(status().isNoContent())
            .andExpect(cookie().maxAge("XSRF-TOKEN", 0));

        Cookie regenerated = requestCsrfCookie();
        assertNotEquals(original.getValue(), regenerated.getValue());
        mockMvc.perform(post("/api/auth/login")
                .with(csrfCookie(regenerated))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"admin\",\"password\":\"admin123\"}"))
            .andExpect(status().isOk());
    }

    @ParameterizedTest
    @ValueSource(strings = {"missing-cookie", "missing-header", "mismatched-header"})
    void loginShouldStillRejectMissingOrMismatchedCsrf(String scenario) throws Exception {
        Cookie token = requestCsrfCookie();
        var request = post("/api/auth/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"admin\",\"password\":\"admin123\"}");
        if (!scenario.equals("missing-cookie")) {
            request.cookie(token);
        }
        if (!scenario.equals("missing-header")) {
            request.header("X-XSRF-TOKEN", scenario.equals("mismatched-header") ? "different-token" : token.getValue());
        }

        MvcResult rejected = mockMvc.perform(request)
            .andExpect(status().isForbidden())
            .andReturn();
        assertNull(rejected.getRequest().getSession(false));
    }

    @Test
    void loginShouldCreateRestorableSessionAndLogoutShouldInvalidateIt() throws Exception {
        Cookie csrfCookie = requestCsrfCookie();

        MvcResult loginResult = mockMvc.perform(post("/api/auth/login")
                .cookie(csrfCookie)
                .header("X-XSRF-TOKEN", csrfCookie.getValue())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"username":"admin","password":"admin123"}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.username").value("admin"))
            .andExpect(jsonPath("$.role").value("ADMIN"))
            .andReturn();

        MockHttpSession session = (MockHttpSession) loginResult.getRequest().getSession(false);
        assertNotNull(session);

        mockMvc.perform(get("/api/auth/me").session(session))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.username").value("admin"));

        mockMvc.perform(post("/api/auth/logout")
                .session(session)
                .cookie(csrfCookie)
                .header("X-XSRF-TOKEN", csrfCookie.getValue()))
            .andExpect(status().isNoContent())
            .andExpect(cookie().maxAge("JSESSIONID", 0));

        mockMvc.perform(get("/api/auth/me"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void invalidCredentialsShouldReturnUnauthorizedWithoutBrowserChallenge() throws Exception {
        Cookie csrfCookie = requestCsrfCookie();

        mockMvc.perform(post("/api/auth/login")
                .cookie(csrfCookie)
                .header("X-XSRF-TOKEN", csrfCookie.getValue())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"username":"admin","password":"wrong-password"}
                    """))
            .andExpect(status().isUnauthorized())
            .andExpect(header().doesNotExist(HttpHeaders.WWW_AUTHENTICATE))
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$.message").value("Usuário ou senha inválidos."));
    }

    @Test
    void unknownUserShouldReturnSameUnauthorizedMessage() throws Exception {
        Cookie csrfCookie = requestCsrfCookie();

        mockMvc.perform(post("/api/auth/login")
                .cookie(csrfCookie)
                .header("X-XSRF-TOKEN", csrfCookie.getValue())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"username":"usuario-inexistente","password":"wrong-password"}
                    """))
            .andExpect(status().isUnauthorized())
            .andExpect(header().doesNotExist(HttpHeaders.WWW_AUTHENTICATE))
            .andExpect(jsonPath("$.message").value("Usuário ou senha inválidos."));
    }

    @Test
    void unauthenticatedApiRequestShouldReturnUnauthorized() throws Exception {
        mockMvc.perform(get("/api/rmas"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.message").value("Unauthorized"));
    }

    @Test
    void viewerShouldReadCatalogAndRmasButNotMutateData() throws Exception {
        Cookie csrfCookie = requestCsrfCookie();

        mockMvc.perform(get("/api/clients").with(user("viewer").roles("VIEWER")))
            .andExpect(status().isOk());
        mockMvc.perform(get("/api/products").with(user("viewer").roles("VIEWER")))
            .andExpect(status().isOk());
        mockMvc.perform(get("/api/rmas").with(user("viewer").roles("VIEWER")))
            .andExpect(status().isOk());
        mockMvc.perform(get("/api/users/assignable").with(user("viewer").roles("VIEWER")))
            .andExpect(status().isOk());

        mockMvc.perform(post("/api/clients")
                .with(user("viewer").roles("VIEWER"))
                .with(csrfCookie(csrfCookie))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"legalName\":\"Forbidden client\"}"))
            .andExpect(status().isForbidden());
        mockMvc.perform(patch("/api/rmas/999999/status")
                .with(user("viewer").roles("VIEWER"))
                .with(csrfCookie(csrfCookie))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"TRIAGE\"}"))
            .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/users").with(user("viewer").roles("VIEWER")))
            .andExpect(status().isForbidden());
    }

    @Test
    void serviceDeskShouldManageCatalogAndRmaFollowUpButNotDiagnosisOrUsers() throws Exception {
        Cookie csrfCookie = requestCsrfCookie();

        mockMvc.perform(post("/api/clients")
                .with(user("service.desk").roles("SERVICE_DESK"))
                .with(csrfCookie(csrfCookie))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"legalName\":\"Authorized client\"}"))
            .andExpect(status().isCreated());
        mockMvc.perform(post("/api/products")
                .with(user("service.desk").roles("SERVICE_DESK"))
                .with(csrfCookie(csrfCookie))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/rmas")
                .with(user("service.desk").roles("SERVICE_DESK"))
                .with(csrfCookie(csrfCookie))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isBadRequest());
        mockMvc.perform(put("/api/rmas/999999")
                .with(user("service.desk").roles("SERVICE_DESK"))
                .with(csrfCookie(csrfCookie))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isNotFound());
        mockMvc.perform(patch("/api/rmas/999999/assignee")
                .with(user("service.desk").roles("SERVICE_DESK"))
                .with(csrfCookie(csrfCookie))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"assigneeId\":null}"))
            .andExpect(status().isNotFound());
        mockMvc.perform(patch("/api/rmas/999999/status")
                .with(user("service.desk").roles("SERVICE_DESK"))
                .with(csrfCookie(csrfCookie))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"TRIAGE\"}"))
            .andExpect(status().isNotFound());
        mockMvc.perform(delete("/api/clients/999999")
                .with(user("service.desk").roles("SERVICE_DESK"))
                .with(csrfCookie(csrfCookie)))
            .andExpect(status().isNotFound());

        mockMvc.perform(put("/api/rmas/999999/diagnosis")
                .with(user("service.desk").roles("SERVICE_DESK"))
                .with(csrfCookie(csrfCookie))
                .contentType(MediaType.APPLICATION_JSON)
                .content(validDiagnosis()))
            .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/users").with(user("service.desk").roles("SERVICE_DESK")))
            .andExpect(status().isForbidden());
    }

    @Test
    void technicianShouldPerformTechnicalActionsButNotOpenOrEditRmas() throws Exception {
        Cookie csrfCookie = requestCsrfCookie();

        mockMvc.perform(patch("/api/rmas/999999/status")
                .with(user("technician").roles("TECHNICIAN"))
                .with(csrfCookie(csrfCookie))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"IN_DIAGNOSIS\"}"))
            .andExpect(status().isNotFound());
        mockMvc.perform(patch("/api/rmas/999999/assignee")
                .with(user("technician").roles("TECHNICIAN"))
                .with(csrfCookie(csrfCookie))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"assigneeId\":null}"))
            .andExpect(status().isForbidden());
        mockMvc.perform(put("/api/rmas/999999/diagnosis")
                .with(user("technician").roles("TECHNICIAN"))
                .with(csrfCookie(csrfCookie))
                .contentType(MediaType.APPLICATION_JSON)
                .content(validDiagnosis()))
            .andExpect(status().isNotFound());

        mockMvc.perform(post("/api/rmas")
                .with(user("technician").roles("TECHNICIAN"))
                .with(csrfCookie(csrfCookie))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isForbidden());
        mockMvc.perform(put("/api/rmas/999999")
                .with(user("technician").roles("TECHNICIAN"))
                .with(csrfCookie(csrfCookie))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/products")
                .with(user("technician").roles("TECHNICIAN"))
                .with(csrfCookie(csrfCookie))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isForbidden());
    }

    @Test
    void adminShouldKeepFullApiAccess() throws Exception {
        Cookie csrfCookie = requestCsrfCookie();

        mockMvc.perform(get("/api/users").with(user("admin").roles("ADMIN")))
            .andExpect(status().isOk());
        mockMvc.perform(delete("/api/products/999999")
                .with(user("admin").roles("ADMIN"))
                .with(csrfCookie(csrfCookie)))
            .andExpect(status().isNotFound());
    }

    private Cookie requestCsrfCookie() throws Exception {
        Cookie csrfCookie = mockMvc.perform(get("/api/auth/csrf"))
            .andExpect(status().isNoContent())
            .andExpect(cookie().exists("XSRF-TOKEN"))
            .andReturn().getResponse().getCookie("XSRF-TOKEN");
        assertNotNull(csrfCookie);
        return csrfCookie;
    }

    private RequestPostProcessor csrfCookie(Cookie csrfCookie) {
        return request -> {
            request.setCookies(csrfCookie);
            request.addHeader("X-XSRF-TOKEN", csrfCookie.getValue());
            return request;
        };
    }

    private void createUser(String username, UserRole role) {
        UserAccount user = new UserAccount();
        user.setUsername(username);
        user.setFullName(username);
        user.setPasswordHash(passwordEncoder.encode("password123"));
        user.setRole(role);
        user.setActive(true);
        userAccountRepository.save(user);
    }

    private String validDiagnosis() {
        return """
            {
              "foundFailure": "Component failure",
              "diagnosedAt": "2026-09-24",
              "technicianName": "Test Technician"
            }
            """;
    }
}
