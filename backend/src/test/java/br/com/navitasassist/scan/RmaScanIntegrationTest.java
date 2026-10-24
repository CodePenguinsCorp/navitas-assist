package br.com.navitasassist.scan;

import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.ProductRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.repository.RmaScanActionRepository;
import br.com.navitasassist.repository.RmaScanCodeRepository;
import br.com.navitasassist.rma.CreateRmaRequest;
import br.com.navitasassist.rma.RmaItemRequest;
import br.com.navitasassist.rma.RmaPriority;
import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.rma.RmaResponse;
import br.com.navitasassist.service.RmaService;
import br.com.navitasassist.rma.RmaStatus;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class RmaScanIntegrationTest {

    private static final RequestPostProcessor TECHNICIAN = user("tech").roles("TECHNICIAN");
    private static final RequestPostProcessor DESK = user("desk").roles("SERVICE_DESK");
    private static final RequestPostProcessor VIEWER = user("viewer").roles("VIEWER");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private RmaScanCodeRepository rmaScanCodeRepository;

    @Autowired
    private RmaScanActionRepository rmaScanActionRepository;

    @Autowired
    private RmaRecordRepository rmaRecordRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private ClientRepository clientRepository;

    @Autowired
    private RmaService rmaService;

    private RmaRecord rma;

    @BeforeEach
    void setUp() {
        cleanUp();
        Product product = new Product();
        product.setSku("SKU-NAV43");
        product.setName("Controlador NAV-43");
        product = productRepository.save(product);
        Client client = new Client();
        client.setLegalName("Cliente etiquetas");
        client = clientRepository.save(client);
        RmaResponse created = rmaService.create(new CreateRmaRequest(client.getId(), List.of(new RmaItemRequest(product.getId(), null, "SER-NAV43", null)), null, true,
            LocalDate.now(), null, "Falha", null, null, RmaPriority.MEDIUM, null, null, null));
        rma = rmaRecordRepository.findById(created.id()).orElseThrow();
    }

    @AfterEach
    void cleanUp() {
        rmaScanActionRepository.deleteAll();
        rmaScanCodeRepository.deleteAll();
        rmaRecordRepository.deleteAll();
        productRepository.deleteAll();
        clientRepository.deleteAll();
    }

    @Test
    void issuesAnOpaqueStableTokenOnlyForOperationalRoles() throws Exception {
        String token = issue(TECHNICIAN);

        assertTrue(token.matches("[A-Z2-7]{32}"), token);
        assertFalse(token.contains(rma.getCode()));
        assertFalse(token.contains("RMA"));
        assertEquals(token, issue(DESK));

        mockMvc.perform(post("/api/rmas/{id}/scan-code", rma.getId()).with(VIEWER).with(csrf())).andExpect(status().isForbidden());
    }

    @Test
    void resolvesTheTokenToTheRmaForAnyAuthenticatedUser() throws Exception {
        String token = issue(DESK);

        mockMvc.perform(get("/api/scan/{token}", "  " + token.toLowerCase() + " ").with(VIEWER))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(rma.getId()))
            .andExpect(jsonPath("$.code").value(rma.getCode()))
            .andExpect(jsonPath("$.productName").value("Controlador NAV-43"));

        mockMvc.perform(get("/api/scan/{token}", token)).andExpect(status().isUnauthorized());
    }

    @Test
    void invalidUnknownAndRevokedTokensLookExactlyTheSame() throws Exception {
        String token = issue(DESK);

        mockMvc.perform(post("/api/rmas/{id}/scan-code/revoke", rma.getId()).with(TECHNICIAN).with(csrf())).andExpect(status().isForbidden());
        mockMvc.perform(post("/api/rmas/{id}/scan-code/revoke", rma.getId()).with(DESK).with(csrf())).andExpect(status().isNoContent());

        String revoked = notFoundMessage(token);
        String unknown = notFoundMessage("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
        String malformed = notFoundMessage(rma.getCode());
        assertEquals(revoked, unknown);
        assertEquals(unknown, malformed);
        assertEquals("Scan code not found.", unknown);

        String renewed = issue(DESK);
        assertNotEquals(token, renewed);
        mockMvc.perform(get("/api/scan/{token}", renewed).with(VIEWER)).andExpect(status().isOk());
    }

    @Test
    void servesQrCodeAndBarcodeAsSvgForTheActiveToken() throws Exception {
        mockMvc.perform(get("/api/rmas/{id}/scan-code/qr.svg", rma.getId()).with(VIEWER)).andExpect(status().isNotFound());
        issue(DESK);

        mockMvc.perform(get("/api/rmas/{id}/scan-code/qr.svg", rma.getId()).with(VIEWER))
            .andExpect(status().isOk())
            .andExpect(header().string("Content-Type", containsString("image/svg+xml")))
            .andExpect(header().string("Cache-Control", containsString("no-store")))
            .andExpect(content().string(containsString("<svg")));
        mockMvc.perform(get("/api/rmas/{id}/scan-code/barcode.svg", rma.getId()).with(VIEWER))
            .andExpect(status().isOk())
            .andExpect(content().string(containsString("<svg")));
    }

    @Test
    void quickStatusChangeRequiresPermissionConfirmationAndCurrentStatus() throws Exception {
        String token = issue(DESK);

        changeStatus(token, VIEWER, "RECEIVED", "TRIAGE", true).andExpect(status().isForbidden());
        changeStatus(token, TECHNICIAN, "RECEIVED", "TRIAGE", false).andExpect(status().isBadRequest());
        changeStatus(token, TECHNICIAN, "IN_REPAIR", "TRIAGE", true)
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("RMA status changed. Refresh the item before trying again."));
        changeStatus(token, TECHNICIAN, "RECEIVED", "RECEIVED", true)
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Choose a status different from the current one."));
        assertTrue(rmaScanActionRepository.findAll().isEmpty());

        changeStatus(token, TECHNICIAN, "RECEIVED", "TRIAGE", true)
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("TRIAGE"));

        List<RmaScanAction> actions = rmaScanActionRepository.findByRma_IdOrderByIdAsc(rma.getId());
        assertEquals(1, actions.size());
        assertEquals(ScanActionType.STATUS_CHANGE, actions.get(0).getAction());
        assertEquals(ScanSource.SCANNER, actions.get(0).getSource());
        assertEquals(RmaStatus.RECEIVED, actions.get(0).getFromStatus());
        assertEquals(RmaStatus.TRIAGE, actions.get(0).getToStatus());
        assertEquals("tech", actions.get(0).getPerformedBy());
        assertEquals(RmaStatus.TRIAGE, rmaRecordRepository.findById(rma.getId()).orElseThrow().getStatus());

        mockMvc.perform(post("/api/rmas/{id}/scan-code/revoke", rma.getId()).with(DESK).with(csrf())).andExpect(status().isNoContent());
        changeStatus(token, TECHNICIAN, "TRIAGE", "IN_DIAGNOSIS", true).andExpect(status().isNotFound());
    }

    private String issue(RequestPostProcessor role) throws Exception {
        String body = mockMvc.perform(post("/api/rmas/{id}/scan-code", rma.getId()).with(role).with(csrf()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.rmaCode").value(rma.getCode()))
            .andReturn().getResponse().getContentAsString();
        JsonNode json = objectMapper.readTree(body);
        return json.get("token").asText();
    }

    private String notFoundMessage(String token) throws Exception {
        String body = mockMvc.perform(get("/api/scan/{token}", token).with(VIEWER)).andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("message").asText();
    }

    private ResultActions changeStatus(String token, RequestPostProcessor role, String expected, String target, boolean confirmed) throws Exception {
        Map<String, Object> payload = new HashMap<>();
        payload.put("expectedStatus", expected);
        payload.put("status", target);
        payload.put("source", "SCANNER");
        payload.put("confirmed", confirmed);
        return mockMvc.perform(post("/api/scan/{token}/status", token).with(role).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(payload)));
    }
}
