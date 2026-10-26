package br.com.navitasassist.workflow;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.repository.*;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;

import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class WorkflowConcurrencyIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired RmaRecordRepository rmas;
    @Autowired ClientRepository clients;
    @Autowired ProductRepository products;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactions;

    @BeforeEach
    @AfterEach
    void reset() {
        rmas.deleteAll();
        products.deleteAll();
        clients.deleteAll();
        jdbc.update("delete from checklist_template_versions");
        jdbc.update("delete from checklist_templates");
        jdbc.update(
                "update workflow_config set published_document=(select document from"
                    + " workflow_versions where version=1),version=1,revision=0,draft_document=null"
                    + " where id=1");
        jdbc.update("delete from workflow_versions where version>1");
    }

    @Test
    void concurrentAdminSavesCannotOverwriteOneAnother() throws Exception {
        JsonNode draft = call(post("/api/workflows/draft"), Map.of(), 200);
        ObjectNode first = (ObjectNode) draft.path("definition").deepCopy();
        first.put("name", "Admin one");
        ObjectNode second = first.deepCopy();
        second.put("name", "Admin two");
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<Integer> a =
                    executor.submit(
                            () -> {
                                start.await();
                                return saveStatus(first, draft.path("revision").asLong());
                            });
            Future<Integer> b =
                    executor.submit(
                            () -> {
                                start.await();
                                return saveStatus(second, draft.path("revision").asLong());
                            });
            start.countDown();
            List<Integer> statuses =
                    new ArrayList<>(
                            List.of(a.get(10, TimeUnit.SECONDS), b.get(10, TimeUnit.SECONDS)));
            Collections.sort(statuses);
            assertEquals(List.of(200, 400), statuses);
            assertEquals(
                    draft.path("revision").asLong() + 1,
                    call(get("/api/workflows/draft"), null, 200).path("revision").asLong());
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void transitionWaitsForAtomicChecklistEvidenceUpdate() throws Exception {
        JsonNode rma = createRma();
        long id = rma.path("id").asLong();
        JsonNode template =
                call(
                        post("/api/checklist-templates"),
                        Map.of(
                                "code",
                                "LOCK_CHECK",
                                "name",
                                "Lock test",
                                "active",
                                true,
                                "items",
                                List.of(
                                        Map.of(
                                                "code",
                                                "CHECK",
                                                "label",
                                                "Required",
                                                "required",
                                                true))),
                        201);
        JsonNode execution =
                call(
                        post("/api/rmas/" + id + "/checklists"),
                        Map.of("templateId", template.path("id").asLong()),
                        201);
        JsonNode draft = call(post("/api/workflows/draft"), Map.of(), 200);
        ObjectNode definition = (ObjectNode) draft.path("definition").deepCopy();
        for (JsonNode t : definition.path("transitions"))
            if (t.path("from").asText().equals("RECEIVED")
                    && t.path("to").asText().equals("TRIAGE"))
                ((ObjectNode) t)
                        .set(
                                "conditions",
                                mapper.valueToTree(
                                        List.of(
                                                Map.of(
                                                        "type",
                                                        "CHECKLIST",
                                                        "field",
                                                        "LOCK_CHECK",
                                                        "operator",
                                                        "EQUALS",
                                                        "value",
                                                        "true"))));
        JsonNode saved =
                call(
                        put("/api/workflows/draft"),
                        Map.of(
                                "expectedRevision",
                                draft.path("revision").asLong(),
                                "definition",
                                definition),
                        200);
        call(
                post("/api/workflows/publish"),
                Map.of("expectedRevision", saved.path("revision").asLong()),
                200);
        CountDownLatch evidenceWritten = new CountDownLatch(1),
                release = new CountDownLatch(1),
                transitionStarted = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<?> evidence =
                    executor.submit(
                            () ->
                                    new TransactionTemplate(transactions)
                                            .executeWithoutResult(
                                                    tx -> {
                                                        rmas.findByIdForUpdate(id).orElseThrow();
                                                        try {
                                                            call(
                                                                    patch(
                                                                            "/api/rmas/"
                                                                                    + id
                                                                                    + "/checklists/"
                                                                                    + execution
                                                                                            .path(
                                                                                                    "id")
                                                                                            .asLong()
                                                                                    + "/items/CHECK"),
                                                                    Map.of(
                                                                            "checked",
                                                                            true,
                                                                            "note",
                                                                            "Verified",
                                                                            "expectedRevision",
                                                                            1),
                                                                    200);
                                                            evidenceWritten.countDown();
                                                            assertTrue(
                                                                    release.await(
                                                                            10, TimeUnit.SECONDS));
                                                        } catch (Exception e) {
                                                            throw new RuntimeException(e);
                                                        }
                                                    }));
            assertTrue(evidenceWritten.await(10, TimeUnit.SECONDS));
            Future<JsonNode> transition =
                    executor.submit(
                            () -> {
                                transitionStarted.countDown();
                                return call(
                                        patch("/api/rmas/" + id + "/status"),
                                        Map.of("status", "TRIAGE", "expectedStatus", "RECEIVED"),
                                        200);
                            });
            assertTrue(transitionStarted.await(10, TimeUnit.SECONDS));
            assertThrows(TimeoutException.class, () -> transition.get(200, TimeUnit.MILLISECONDS));
            release.countDown();
            evidence.get(10, TimeUnit.SECONDS);
            assertEquals("TRIAGE", transition.get(10, TimeUnit.SECONDS).path("status").asText());
        } finally {
            release.countDown();
            executor.shutdownNow();
        }
    }

    @Test
    void mutationTimestampCanBeUsedForNextRelatedRmaMutation() throws Exception {
        JsonNode created = createRma();
        long id = created.path("id").asLong();
        JsonNode first =
                call(
                        patch("/api/rmas/" + id + "/related-rma"),
                        Map.of(
                                "note",
                                "Initial relation review",
                                "expectedUpdatedAt",
                                created.path("updatedAt").asText()),
                        200);
        call(
                patch("/api/rmas/" + id + "/related-rma"),
                Map.of(
                        "note",
                        "Second relation review",
                        "expectedUpdatedAt",
                        first.path("updatedAt").asText()),
                200);
    }

    private int saveStatus(ObjectNode definition, long revision) throws Exception {
        return mvc.perform(
                        put("/api/workflows/draft")
                                .with(user("admin").roles("ADMIN"))
                                .with(csrf())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        mapper.writeValueAsString(
                                                Map.of(
                                                        "expectedRevision",
                                                        revision,
                                                        "definition",
                                                        definition))))
                .andReturn()
                .getResponse()
                .getStatus();
    }

    private JsonNode createRma() throws Exception {
        Client c = new Client();
        c.setLegalName("Concurrent client");
        c = clients.save(c);
        Product p = new Product();
        p.setSku("WF-CONCURRENT");
        p.setName("Concurrent product");
        p.setDefaultWarrantyMonths(12);
        p = products.save(p);
        return call(
                post("/api/rmas"),
                Map.of(
                        "clientId",
                        c.getId(),
                        "items",
                        List.of(Map.of("productId", p.getId(), "serialNumber", "CONCURRENT")),
                        "purchaseDateUnknown",
                        true,
                        "entryDate",
                        LocalDate.now().toString(),
                        "reportedFailure",
                        "Failure"),
                201);
    }

    private JsonNode call(MockHttpServletRequestBuilder request, Object body, int expected)
            throws Exception {
        request.with(user("admin").roles("ADMIN")).with(csrf());
        if (body != null)
            request.contentType(MediaType.APPLICATION_JSON)
                    .content(mapper.writeValueAsString(body));
        String response =
                mvc.perform(request)
                        .andExpect(status().is(expected))
                        .andReturn()
                        .getResponse()
                        .getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        return response.isEmpty() ? NullNode.instance : mapper.readTree(response);
    }
}
