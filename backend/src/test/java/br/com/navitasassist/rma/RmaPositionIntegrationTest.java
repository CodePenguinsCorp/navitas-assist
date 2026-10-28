package br.com.navitasassist.rma;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class RmaPositionIntegrationTest {
    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper json;
    @Autowired private RmaRecordRepository rmas;
    @Autowired private ClientRepository clients;
    @Autowired private ProductRepository products;
    private Long clientId;
    private Long productId;

    @BeforeEach
    void setup() {
        rmas.deleteAll();
        products.deleteAll();
        clients.deleteAll();
        Client client = new Client();
        client.setLegalName("Ordering client");
        clientId = clients.save(client).getId();
        Product product = new Product();
        product.setSku("ORDER-1");
        product.setName("Ordering product");
        product.setDefaultWarrantyMonths(12);
        productId = products.save(product).getId();
    }

    @Test
    void persistsRelativeOrderWithoutChangingStatusOrHistoryAndAppendsNewCards() throws Exception {
        long a = create(), b = create(), c = create();
        move(c, "RECEIVED", a, false, "TECHNICIAN").andExpect(status().isOk());
        assertEquals(List.of(c, a, b), ids(board("RECEIVED")));
        JsonNode card = json.readTree(mvc.perform(get("/api/rmas/{id}", c).with(user("other").roles("VIEWER")))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals("RECEIVED", card.path("status").asText());
        assertEquals(1, card.path("statusHistory").size());
        long d = create();
        assertEquals(List.of(c, a, b, d), ids(board("RECEIVED")));
        move(c, "RECEIVED", b, true, "SERVICE_DESK").andExpect(status().isOk());
        assertEquals(List.of(a, b, c, d), ids(board("RECEIVED")));
    }

    @Test
    void reordersAgainstOneVisibleAnchorAndKeepsHiddenCardsInTheirRelativeOrder() throws Exception {
        long a = create(), hidden = create(), c = create(), d = create();
        move(d, "RECEIVED", a, true, "ADMIN").andExpect(status().isOk());
        assertEquals(List.of(a, d, hidden, c), ids(board("RECEIVED")));
    }

    @Test
    void statusChangesAppendToDestinationIncludingBulkAndReopening() throws Exception {
        long a = create(), b = create(), c = create();
        changeStatus(b, "TRIAGE", false);
        changeStatus(a, "TRIAGE", true);
        assertEquals(List.of(b, a), ids(board("TRIAGE")));
        assertEquals(List.of(c), ids(board("RECEIVED")));
        changeStatus(b, "COMPLETED", false);
        changeStatus(b, "TRIAGE", false);
        assertEquals(List.of(a, b), ids(board("TRIAGE")));
        changeStatus(a, "TRIAGE", false);
        assertEquals(List.of(a, b), ids(board("TRIAGE")));
    }

    @Test
    void rejectsStaleStatusCrossColumnSelfAndMissingAnchorsWithoutReordering() throws Exception {
        long a = create(), b = create();
        changeStatus(b, "TRIAGE", false);
        move(a, "TRIAGE", b, false, "ADMIN").andExpect(status().isBadRequest());
        move(a, "RECEIVED", b, false, "ADMIN").andExpect(status().isBadRequest());
        move(a, "RECEIVED", a, false, "ADMIN").andExpect(status().isBadRequest());
        move(a, "RECEIVED", Long.MAX_VALUE, false, "ADMIN").andExpect(status().isBadRequest());
        move(Long.MAX_VALUE, "RECEIVED", a, false, "ADMIN").andExpect(status().isNotFound());
        assertEquals(List.of(a), ids(board("RECEIVED")));
        assertEquals(List.of(b), ids(board("TRIAGE")));
    }

    @Test
    void validatesRequiredFieldsAndDeniesUnauthenticatedAndViewerWrites() throws Exception {
        long a = create(), b = create();
        move(a, "RECEIVED", b, false, "VIEWER").andExpect(status().isForbidden());
        mvc.perform(patch("/api/rmas/{id}/position", a).with(csrf()).contentType(MediaType.APPLICATION_JSON)
            .content("{}")).andExpect(status().isUnauthorized());
        for (String body : List.of("{}", "{\"expectedStatus\":\"RECEIVED\"}",
            "{\"expectedStatus\":\"RECEIVED\",\"anchorId\":1}",
            "{\"expectedStatus\":\"RECEIVED\",\"anchorId\":-1,\"after\":false}")) {
            mvc.perform(patch("/api/rmas/{id}/position", a).with(user("admin").roles("ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
        }
        assertEquals(List.of(a, b), ids(board("RECEIVED")));
    }

    @ParameterizedTest
    @ValueSource(strings = {"ADMIN", "SERVICE_DESK", "TECHNICIAN"})
    void allowsOperationalRoles(String role) throws Exception {
        long a = create(), b = create();
        move(b, "RECEIVED", a, false, role).andExpect(status().isOk());
        assertEquals(List.of(b, a), ids(board("RECEIVED")));
    }

    @Test
    void serializesConcurrentReordersWithoutDuplicatingPositionsOrLosingCards() throws Exception {
        long a = create(), b = create(), c = create(), d = create();
        runConcurrently(() -> move(c, "RECEIVED", a, false, "ADMIN").andExpect(status().isOk()),
            () -> move(d, "RECEIVED", b, false, "TECHNICIAN").andExpect(status().isOk()));
        JsonNode board = board("RECEIVED");
        assertEquals(List.of(c, a, d, b), ids(board));
        assertUniquePositions(board);
    }

    @Test
    void serializesConcurrentCreationAndEntryIntoAnEmptyColumn() throws Exception {
        runConcurrently(this::create, this::create);
        JsonNode received = board("RECEIVED");
        assertEquals(2, received.size());
        assertUniquePositions(received);
        long a = received.get(0).path("id").asLong(), b = received.get(1).path("id").asLong();
        runConcurrently(() -> changeStatus(a, "TRIAGE", false), () -> changeStatus(b, "TRIAGE", true));
        JsonNode triage = board("TRIAGE");
        assertEquals(new HashSet<>(List.of(a, b)), new HashSet<>(ids(triage)));
        assertUniquePositions(triage);
        assertTrue(ids(board("RECEIVED")).isEmpty());
    }

    private long create() throws Exception {
        String body = json.writeValueAsString(Map.of("clientId", clientId,
            "items", List.of(Map.of("productId", productId, "serialNumber", "ORDER-SERIAL")),
            "purchaseDateUnknown", true, "entryDate", LocalDate.of(2026, 1, 1).toString(), "reportedFailure", "Failure"));
        return json.readTree(mvc.perform(post("/api/rmas").with(user("admin").roles("ADMIN")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString()).path("id").asLong();
    }

    private ResultActions move(long id, String expected, long anchor, boolean after, String role) throws Exception {
        return mvc.perform(patch("/api/rmas/{id}/position", id).with(user("operator").roles(role)).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of(
                "expectedStatus", expected, "anchorId", anchor, "after", after))));
    }

    private void changeStatus(long id, String target, boolean bulk) throws Exception {
        Map<String, Object> body = bulk ? Map.of("status", target, "expectedStatus", "RECEIVED") : Map.of("status", target);
        mvc.perform(patch("/api/rmas/{id}/" + (bulk ? "bulk-status" : "status"), id)
            .with(user("operator").roles("TECHNICIAN")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(body))).andExpect(status().isOk());
    }

    private JsonNode board(String column) throws Exception {
        return json.readTree(mvc.perform(get("/api/rmas").param("status", column).param("boardOrder", "true")
            .with(user("reader").roles("VIEWER"))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private List<Long> ids(JsonNode board) {
        List<Long> ids = new ArrayList<>();
        board.forEach(card -> ids.add(card.path("id").asLong()));
        return ids;
    }

    private void assertUniquePositions(JsonNode board) {
        var positions = new HashSet<Long>();
        board.forEach(card -> {
            assertTrue(card.has("boardPosition"));
            assertTrue(card.path("boardPosition").asLong() > 0);
            assertTrue(positions.add(card.path("boardPosition").asLong()));
        });
    }

    private void runConcurrently(CheckedOperation first, CheckedOperation second) throws Exception {
        var executor = Executors.newFixedThreadPool(2);
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        try {
            var futures = List.of(first, second).stream().map(operation -> executor.submit(() -> {
                ready.countDown();
                assertTrue(start.await(5, TimeUnit.SECONDS));
                operation.run();
                return null;
            })).toList();
            assertTrue(ready.await(5, TimeUnit.SECONDS));
            start.countDown();
            for (var future : futures) future.get(15, TimeUnit.SECONDS);
        } finally {
            executor.shutdownNow();
        }
    }

    @FunctionalInterface
    private interface CheckedOperation {
        void run() throws Exception;
    }
}
