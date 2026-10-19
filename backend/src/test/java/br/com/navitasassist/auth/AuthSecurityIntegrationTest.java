package br.com.navitasassist.auth;

import static org.junit.jupiter.api.Assertions.assertNotNull;
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
            .andExpect(jsonPath("$.message").value("Unauthorized"));
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
