package br.com.navitasassist.rma;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.ProductRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class RmaBlockIntegrationTest {
    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private RmaRecordRepository rmas;
    @Autowired private ClientRepository clients;
    @Autowired private ProductRepository products;
    private long id;

    @BeforeEach
    void prepare() throws Exception {
        rmas.deleteAll();
        products.deleteAll();
        clients.deleteAll();
        Client client = new Client();
        client.setLegalName("Block test client");
        client = clients.save(client);
        Product product = new Product();
        product.setSku("BLOCK-01");
        product.setName("Block test product");
        product.setDefaultWarrantyMonths(12);
        product = products.save(product);
        String body = mapper.writeValueAsString(Map.of("clientId", client.getId(), "items", List.of(Map.of("productId", product.getId(), "batchNumber", "BLOCK")), "purchaseDateUnknown", true, "entryDate", LocalDate.now().toString(), "reportedFailure", "Failure"));
        id = mapper.readTree(mvc.perform(post("/api/rmas").with(user("desk").roles("SERVICE_DESK")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8)).get("id").asLong();
    }

    @Test
    void preservesStatusSlaAndEveryBlockEpisode() throws Exception {
        JsonNode before = read();
        Instant started = Instant.now();
        JsonNode blocked = block("TECHNICIAN", "  Aguardando fornecedor  ", "  Peças  ");
        JsonNode episode = blocked.get("currentBlock");
        long blockId = episode.get("id").asLong();
        assertEquals("RECEIVED", blocked.get("status").asText());
        assertEquals("Aguardando fornecedor", episode.get("reason").asText());
        assertEquals("Peças", episode.get("category").asText());
        assertEquals("operator", episode.get("blockedBy").asText());
        assertTrue(!Instant.parse(episode.get("blockedAt").asText()).isBefore(started));
        assertEquals(before.get("sla").get("startedAt"), blocked.get("sla").get("startedAt"));
        assertEquals(before.get("sla").get("dueAt"), blocked.get("sla").get("dueAt"));
        mvc.perform(post("/api/rmas/{id}/blocks", id).with(user("operator").roles("ADMIN")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Duplicate\"}")).andExpect(status().isBadRequest());
        mvc.perform(patch("/api/rmas/{id}/status", id).with(user("operator").roles("TECHNICIAN")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"TRIAGE\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.currentBlock.id").value(blockId));
        mvc.perform(patch("/api/rmas/{id}/blocks/{blockId}", id, blockId).with(user("resolver").roles("SERVICE_DESK")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"resolutionNote\":\"  Peça recebida  \"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.currentBlock").isEmpty()).andExpect(jsonPath("$.status").value("TRIAGE"));
        JsonNode resolved = read().get("blockHistory").get(0);
        assertEquals("resolver", resolved.get("resolvedBy").asText());
        assertEquals("Peça recebida", resolved.get("resolutionNote").asText());
        assertTrue(!Instant.parse(resolved.get("resolvedAt").asText()).isBefore(Instant.parse(episode.get("blockedAt").asText())));
        JsonNode next = block("ADMIN", "Outro impedimento", "");
        long nextId = next.get("currentBlock").get("id").asLong();
        assertEquals(2, next.get("blockHistory").size());
        mvc.perform(patch("/api/rmas/{id}/blocks/{blockId}", id, blockId).with(user("operator").roles("ADMIN")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"resolutionNote\":\"Stale\"}")).andExpect(status().isBadRequest());
        assertEquals(nextId, read().get("currentBlock").get("id").asLong());
    }

    @Test
    void enforcesRolesCsrfAndInputValidation() throws Exception {
        for (String role : List.of("VIEWER")) {
            mvc.perform(post("/api/rmas/{id}/blocks", id).with(user("viewer").roles(role)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Denied\"}")).andExpect(status().isForbidden());
            mvc.perform(patch("/api/rmas/{id}/blocks/1", id).with(user("viewer").roles(role)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"resolutionNote\":\"Denied\"}")).andExpect(status().isForbidden());
        }
        mvc.perform(post("/api/rmas/{id}/blocks", id).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Denied\"}")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/rmas/{id}/blocks", id).with(user("operator").roles("ADMIN")).contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Denied\"}")).andExpect(status().isForbidden());
        for (String body : List.of("{}", "{\"reason\":\"   \"}", mapper.writeValueAsString(Map.of("reason", "x".repeat(1001))), mapper.writeValueAsString(Map.of("reason", "Valid", "category", "x".repeat(81))))) {
            mvc.perform(post("/api/rmas/{id}/blocks", id).with(user("operator").roles("TECHNICIAN")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
        }
        long blockId = block("SERVICE_DESK", "x".repeat(1000), "x".repeat(80)).get("currentBlock").get("id").asLong();
        for (String note : List.of(" ", "x".repeat(1001))) {
            mvc.perform(patch("/api/rmas/{id}/blocks/{blockId}", id, blockId).with(user("operator").roles("TECHNICIAN")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(Map.of("resolutionNote", note)))).andExpect(status().isBadRequest());
        }
        mvc.perform(get("/api/rmas/{id}", id).with(user("viewer").roles("VIEWER"))).andExpect(status().isOk()).andExpect(jsonPath("$.currentBlock.id").value(blockId));
        mvc.perform(post("/api/rmas/999999/blocks").with(user("operator").roles("ADMIN")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Missing\"}")).andExpect(status().isNotFound());
    }

    @Test
    void serializesConcurrentBlocks() throws Exception {
        var pool = Executors.newFixedThreadPool(2);
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        try {
            var jobs = java.util.stream.IntStream.range(0, 2).mapToObj(index -> pool.submit(() -> {
                ready.countDown();
                if (!start.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Barrier timed out");
                return mvc.perform(post("/api/rmas/{id}/blocks", id).with(user("operator" + index).roles("TECHNICIAN")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Concurrent\"}")).andReturn().getResponse().getStatus();
            })).toList();
            assertTrue(ready.await(10, TimeUnit.SECONDS));
            start.countDown();
            int first = jobs.get(0).get(20, TimeUnit.SECONDS);
            int second = jobs.get(1).get(20, TimeUnit.SECONDS);
            assertEquals(List.of(200, 400), java.util.stream.Stream.of(first, second).sorted().toList());
            assertEquals(1, read().get("blockHistory").size());
        } finally {
            start.countDown();
            pool.shutdownNow();
        }
    }

    private JsonNode block(String role, String reason, String category) throws Exception {
        return mapper.readTree(mvc.perform(post("/api/rmas/{id}/blocks", id).with(user("operator").roles(role)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(Map.of("reason", reason, "category", category))))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private JsonNode read() throws Exception {
        return mapper.readTree(mvc.perform(get("/api/rmas/{id}", id).with(user("viewer").roles("VIEWER"))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
    }
}
