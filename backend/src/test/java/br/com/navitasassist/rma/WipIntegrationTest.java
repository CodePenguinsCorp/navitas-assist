package br.com.navitasassist.rma;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.hamcrest.Matchers.hasItem;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.concurrent.*;
import br.com.navitasassist.client.Client;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.repository.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class WipIntegrationTest {
    private static final List<String> ACTIVE = List.of("RECEIVED", "TRIAGE", "IN_DIAGNOSIS", "WAITING_PART", "IN_REPAIR", "IN_TESTS");
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired RmaRecordRepository rmas;
    @Autowired ProductRepository products;
    @Autowired ClientRepository clients;
    private Long clientId;
    private Long productId;

    @BeforeEach
    void setup() throws Exception {
        rmas.deleteAll();
        products.deleteAll();
        clients.deleteAll();
        resetLimits();
        Client client = new Client();
        client.setLegalName("WIP client");
        clientId = clients.save(client).getId();
        Product product = new Product();
        product.setSku("WIP-PRODUCT");
        product.setName("WIP product");
        product.setDefaultWarrantyMonths(12);
        productId = products.save(product).getId();
    }

    @AfterEach
    void resetLimits() throws Exception {
        for (String column : ACTIVE) configure(column, "{\"maxItems\":null,\"blocking\":false}", "ADMIN").andExpect(status().isOk());
    }

    @Test
    void configRequiresAdminAndRejectsInvalidLimitsAndInactiveColumns() throws Exception {
        mvc.perform(get("/api/kanban-wip")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/kanban-wip").with(user("viewer").roles("VIEWER")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(6));
        configure("TRIAGE", "{\"maxItems\":1,\"blocking\":true}", "VIEWER").andExpect(status().isForbidden());
        configure("TRIAGE", "{\"maxItems\":1,\"blocking\":true}", "SERVICE_DESK").andExpect(status().isForbidden());
        configure("TRIAGE", "{\"maxItems\":0,\"blocking\":true}", "ADMIN").andExpect(status().isBadRequest());
        configure("TRIAGE", "{\"maxItems\":1.5,\"blocking\":true}", "ADMIN").andExpect(status().isBadRequest());
        configure("TRIAGE", "{\"maxItems\":\"bad\",\"blocking\":true}", "ADMIN").andExpect(status().isBadRequest());
        configure("COMPLETED", "{\"maxItems\":1,\"blocking\":true}", "ADMIN").andExpect(status().isBadRequest());
        configure("TRIAGE", "{\"maxItems\":2,\"blocking\":true}", "ADMIN")
            .andExpect(status().isOk()).andExpect(jsonPath("$.maxItems").value(2)).andExpect(jsonPath("$.blocking").value(true));
        mvc.perform(get("/api/kanban-wip").with(user("viewer").roles("VIEWER")))
            .andExpect(jsonPath("$[?(@.status == 'TRIAGE')].maxItems").value(hasItem(2)));
    }

    @Test
    void warningAllowsExcessAndLoweringLimitBlocksOnlyNewEntries() throws Exception {
        long first = create(null), second = create(null), third = create(null);
        configure("TRIAGE", "{\"maxItems\":1,\"blocking\":false}", "ADMIN").andExpect(status().isOk());
        move(first, false, null, "TECHNICIAN").andExpect(status().isOk());
        move(second, false, null, "TECHNICIAN").andExpect(status().isOk());
        configure("TRIAGE", "{\"maxItems\":1,\"blocking\":true}", "ADMIN")
            .andExpect(status().isOk()).andExpect(jsonPath("$.currentCount").value(2));
        move(first, false, null, "TECHNICIAN").andExpect(status().isOk());
        move(third, false, null, "TECHNICIAN").andExpect(status().isBadRequest());
        assertEquals(2, rmas.findAll().stream().filter(r -> r.getStatus() == RmaStatus.TRIAGE).count());
    }

    @Test
    void blockingAndOverridesApplyToSingleBulkAndCreationWithAudit() throws Exception {
        long first = create(null), second = create(null);
        configure("TRIAGE", "{\"maxItems\":1,\"blocking\":true}", "ADMIN").andExpect(status().isOk());
        move(first, true, null, "TECHNICIAN").andExpect(status().isOk());
        move(second, true, null, "TECHNICIAN").andExpect(status().isBadRequest());
        move(second, false, "Urgente", "TECHNICIAN").andExpect(status().isForbidden());
        move(second, false, "   ", "ADMIN").andExpect(status().isBadRequest());
        move(second, false, "Urgente", "ADMIN").andExpect(status().isOk())
            .andExpect(jsonPath("$.statusHistory[?(@.note == 'WIP override: Urgente')].changedBy").value(hasItem("operator")))
            .andExpect(jsonPath("$.statusHistory[?(@.note == 'WIP override: Urgente')].changedAt").isNotEmpty())
            .andExpect(jsonPath("$.statusHistory[?(@.note == 'WIP override: Urgente')].status").value(hasItem("TRIAGE")));
        configure("RECEIVED", "{\"maxItems\":1,\"blocking\":true}", "ADMIN").andExpect(status().isOk());
        create(null);
        mvc.perform(post("/api/rmas").with(user("operator").roles("SERVICE_DESK")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content(createBody(null))).andExpect(status().isBadRequest());
        create("Recebimento urgente");
    }

    @Test
    void twoConcurrentRequestsCannotBothTakeLastSlot() throws Exception {
        long first = create(null), second = create(null);
        configure("TRIAGE", "{\"maxItems\":1,\"blocking\":true}", "ADMIN").andExpect(status().isOk());
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2), start = new CountDownLatch(1);
        try {
            List<Future<Integer>> results = List.of(first, second).stream().map(id -> executor.submit(() -> {
                ready.countDown();
                if (!start.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("start timeout");
                return move(id, true, null, "TECHNICIAN").andReturn().getResponse().getStatus();
            })).toList();
            if (!ready.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("ready timeout");
            start.countDown();
            List<Integer> statuses = List.of(results.get(0).get(30, TimeUnit.SECONDS), results.get(1).get(30, TimeUnit.SECONDS)).stream().sorted().toList();
            assertEquals(List.of(200, 400), statuses);
            assertEquals(1, rmas.findAll().stream().filter(r -> r.getStatus() == RmaStatus.TRIAGE).count());
        } finally {
            start.countDown();
            executor.shutdownNow();
        }
    }

    private org.springframework.test.web.servlet.ResultActions configure(String column, String body, String role) throws Exception {
        return mvc.perform(put("/api/kanban-wip/" + column).with(user("operator").roles(role)).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private org.springframework.test.web.servlet.ResultActions move(long id, boolean bulk, String reason, String role) throws Exception {
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("status", "TRIAGE");
        body.put("note", null);
        if (bulk) body.put("expectedStatus", "RECEIVED");
        if (reason != null) body.put("wipOverrideReason", reason);
        return mvc.perform(patch("/api/rmas/" + id + (bulk ? "/bulk-status" : "/status"))
            .with(user("operator").roles(role)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }

    private long create(String reason) throws Exception {
        String body = mvc.perform(post("/api/rmas").with(user("operator").roles("ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(createBody(reason)))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return json.readTree(body).get("id").asLong();
    }

    private String createBody(String reason) throws Exception {
        Map<String, Object> body = new java.util.LinkedHashMap<>(Map.of("clientId", clientId, "items", List.of(Map.of("productId", productId, "batchNumber", "WIP")),
            "purchaseDateUnknown", true, "entryDate", LocalDate.now(ZoneId.of("America/Sao_Paulo")).toString(), "reportedFailure", "WIP failure"));
        if (reason != null) body.put("wipOverrideReason", reason);
        return json.writeValueAsString(body);
    }
}
