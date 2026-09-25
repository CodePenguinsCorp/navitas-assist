package br.com.navitasassist.auth;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.user.UserAccount;
import br.com.navitasassist.user.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
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
    void invalidCredentialsShouldReturnUnauthorizedWithoutBrowserChallenge() throws Exception {
        mockMvc.perform(get("/api/auth/me").with(httpBasic("admin", "wrong-password")))
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
        mockMvc.perform(get("/api/clients").with(httpBasic("viewer", "password123")))
            .andExpect(status().isOk());
        mockMvc.perform(get("/api/products").with(httpBasic("viewer", "password123")))
            .andExpect(status().isOk());
        mockMvc.perform(get("/api/rmas").with(httpBasic("viewer", "password123")))
            .andExpect(status().isOk());

        mockMvc.perform(post("/api/clients")
                .with(httpBasic("viewer", "password123"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"legalName\":\"Forbidden client\"}"))
            .andExpect(status().isForbidden());
        mockMvc.perform(patch("/api/rmas/999999/status")
                .with(httpBasic("viewer", "password123"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"TRIAGE\"}"))
            .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/users").with(httpBasic("viewer", "password123")))
            .andExpect(status().isForbidden());
    }

    @Test
    void serviceDeskShouldManageCatalogAndRmaFollowUpButNotDiagnosisOrUsers() throws Exception {
        mockMvc.perform(post("/api/clients")
                .with(httpBasic("service.desk", "password123"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"legalName\":\"Authorized client\"}"))
            .andExpect(status().isCreated());
        mockMvc.perform(post("/api/products")
                .with(httpBasic("service.desk", "password123"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/rmas")
                .with(httpBasic("service.desk", "password123"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isBadRequest());
        mockMvc.perform(put("/api/rmas/999999")
                .with(httpBasic("service.desk", "password123"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isNotFound());
        mockMvc.perform(patch("/api/rmas/999999/status")
                .with(httpBasic("service.desk", "password123"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"TRIAGE\"}"))
            .andExpect(status().isNotFound());
        mockMvc.perform(delete("/api/clients/999999").with(httpBasic("service.desk", "password123")))
            .andExpect(status().isNotFound());

        mockMvc.perform(put("/api/rmas/999999/diagnosis")
                .with(httpBasic("service.desk", "password123"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(validDiagnosis()))
            .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/users").with(httpBasic("service.desk", "password123")))
            .andExpect(status().isForbidden());
    }

    @Test
    void technicianShouldPerformTechnicalActionsButNotOpenOrEditRmas() throws Exception {
        mockMvc.perform(patch("/api/rmas/999999/status")
                .with(httpBasic("technician", "password123"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"IN_DIAGNOSIS\"}"))
            .andExpect(status().isNotFound());
        mockMvc.perform(put("/api/rmas/999999/diagnosis")
                .with(httpBasic("technician", "password123"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(validDiagnosis()))
            .andExpect(status().isNotFound());

        mockMvc.perform(post("/api/rmas")
                .with(httpBasic("technician", "password123"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isForbidden());
        mockMvc.perform(put("/api/rmas/999999")
                .with(httpBasic("technician", "password123"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/products")
                .with(httpBasic("technician", "password123"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isForbidden());
    }

    @Test
    void adminShouldKeepFullApiAccess() throws Exception {
        mockMvc.perform(get("/api/users").with(httpBasic("admin", "admin123")))
            .andExpect(status().isOk());
        mockMvc.perform(delete("/api/products/999999").with(httpBasic("admin", "admin123")))
            .andExpect(status().isNotFound());
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
