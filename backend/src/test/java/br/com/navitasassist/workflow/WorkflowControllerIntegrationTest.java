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
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@org.springframework.transaction.annotation.Transactional
class WorkflowControllerIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired RmaRecordRepository rmas;
    @Autowired ClientRepository clients;
    @Autowired ProductRepository products;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;

    @BeforeEach
    void clean() {
        rmas.deleteAll();
        products.deleteAll();
        clients.deleteAll();
    }

    @Test
    void draftIsIsolatedVersionedAndDiscardable() throws Exception {
        JsonNode published = call(get("/api/workflows"), null, 200);
        assertEquals(1, published.path("version").asInt());
        assertEquals(9, published.path("definition").path("statuses").size());
        JsonNode draft = call(post("/api/workflows/draft"), Map.of(), 200);
        ObjectNode definition = (ObjectNode) published.path("definition").deepCopy();
        definition.put("name", "Renamed workflow");
        JsonNode saved =
                call(
                        put("/api/workflows/draft"),
                        Map.of(
                                "expectedRevision",
                                draft.path("revision").asInt(),
                                "definition",
                                definition),
                        200);
        call(
                put("/api/workflows/draft"),
                Map.of(
                        "expectedRevision",
                        draft.path("revision").asInt(),
                        "definition",
                        definition),
                400);
        assertEquals(published, call(get("/api/workflows"), null, 200));
        call(
                delete("/api/workflows/draft").param("revision", saved.path("revision").asText()),
                null,
                204);
        assertTrue(call(get("/api/workflows/draft"), null, 200).path("definition").isNull());
        mvc.perform(get("/api/workflows").with(user("viewer").roles("VIEWER")))
                .andExpect(status().isOk());
        mvc.perform(get("/api/workflows/draft").with(user("viewer").roles("VIEWER")))
                .andExpect(status().isForbidden());
    }

    @Test
    void publicationAndTransitionsEnforceRulesAndPreserveSnapshots() throws Exception {
        long id = createRma();
        JsonNode original = call(get("/api/rmas/" + id), null, 200);
        ObjectNode definition =
                (ObjectNode) call(get("/api/workflows"), null, 200).path("definition").deepCopy();
        ((ArrayNode) definition.path("statuses"))
                .add(
                        mapper.readTree(
                                "{\"code\":\"CUSTOM\",\"label\":\"Custom"
                                    + " stage\",\"category\":\"IN_PROGRESS\",\"active\":true,\"slaStage\":\"TRIAGE\"}"));
        ArrayNode transitions = (ArrayNode) definition.path("transitions");
        transitions.add(
                mapper.readTree(
                        "{\"from\":\"RECEIVED\",\"to\":\"CUSTOM\",\"roles\":[\"ADMIN\"],\"requiredFields\":[\"testSummary\"],\"conditions\":[],\"actions\":[{\"type\":\"SET_PRIORITY\",\"value\":\"HIGH\"},{\"type\":\"ADD_NOTE\",\"value\":\"Workflow"
                            + " action\"}]}"));
        transitions.add(
                mapper.readTree(
                        "{\"from\":\"CUSTOM\",\"to\":\"COMPLETED\",\"roles\":[\"ADMIN\"],\"requiredFields\":[],\"conditions\":[],\"actions\":[]}"));
        publish(definition);
        call(
                patch("/api/rmas/" + id + "/status"),
                Map.of(
                        "status",
                        "CUSTOM",
                        "expectedStatus",
                        "RECEIVED",
                        "expectedWorkflowVersion",
                        1),
                400);
        call(
                patch("/api/rmas/" + id + "/status"),
                Map.of(
                        "status",
                        "CUSTOM",
                        "expectedStatus",
                        "RECEIVED",
                        "expectedWorkflowVersion",
                        2),
                400);
        call(
                patch("/api/rmas/" + id + "/bulk-status"),
                Map.of(
                        "status",
                        "CUSTOM",
                        "expectedStatus",
                        "RECEIVED",
                        "expectedWorkflowVersion",
                        2),
                400);
        assertEquals("MEDIUM", call(get("/api/rmas/" + id), null, 200).path("priority").asText());
        call(put("/api/rmas/" + id), Map.of("testSummary", "Passed"), 200);
        JsonNode changed =
                call(
                        patch("/api/rmas/" + id + "/status"),
                        Map.of(
                                "status",
                                "CUSTOM",
                                "expectedStatus",
                                "RECEIVED",
                                "expectedWorkflowVersion",
                                2),
                        200);
        assertEquals("Custom stage", changed.path("statusLabel").asText());
        assertEquals("HIGH", changed.path("priority").asText());
        assertEquals("NORMAL", changed.path("sla").path("status").asText());
        assertTrue(
                java.util.stream.StreamSupport.stream(
                                changed.path("statusHistory").spliterator(), false)
                        .anyMatch(original.path("statusHistory").get(0)::equals));
        call(
                patch("/api/rmas/" + id + "/status"),
                Map.of("status", "COMPLETED", "expectedStatus", "RECEIVED"),
                400);
        call(
                patch("/api/rmas/" + id + "/status"),
                Map.of("status", "COMPLETED", "expectedStatus", "CUSTOM"),
                200);
        assertEquals(
                "CLOSED",
                call(get("/api/rmas/" + id), null, 200).path("sla").path("status").asText());
    }

    @Test
    void checklistSnapshotsRevisionsAndApprovalRolesAreOperationalEvidence() throws Exception {
        long id = createRma();
        JsonNode template =
                call(
                        post("/api/checklist-templates"),
                        Map.of(
                                "code",
                                "INSPECT",
                                "name",
                                "Inspection",
                                "active",
                                true,
                                "items",
                                List.of(
                                        Map.of(
                                                "code",
                                                "POWER",
                                                "label",
                                                "Power",
                                                "required",
                                                true))),
                        201);
        JsonNode execution =
                call(
                        post("/api/rmas/" + id + "/checklists"),
                        Map.of("templateId", template.path("id").asLong()),
                        201);
        String itemUrl =
                "/api/rmas/" + id + "/checklists/" + execution.path("id").asLong() + "/items/POWER";
        call(
                patch(itemUrl),
                Map.of(
                        "checked",
                        true,
                        "note",
                        "Measured",
                        "expectedRevision",
                        execution.path("revision").asInt()),
                200);
        call(
                patch(itemUrl),
                Map.of(
                        "checked",
                        false,
                        "note",
                        "Stale",
                        "expectedRevision",
                        execution.path("revision").asInt()),
                400);
        JsonNode approval =
                call(
                        post("/api/rmas/" + id + "/approvals"),
                        Map.of("code", "RELEASE", "justification", "Inspection done"),
                        201);
        String approvalUrl = "/api/rmas/" + id + "/approvals/" + approval.path("id").asLong();
        mvc.perform(
                        patch(approvalUrl)
                                .with(user("tech").roles("TECHNICIAN"))
                                .with(csrf())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        mapper.writeValueAsString(
                                                Map.of(
                                                        "status",
                                                        "APPROVED",
                                                        "note",
                                                        "Yes",
                                                        "expectedRevision",
                                                        approval.path("revision").asInt()))))
                .andExpect(status().isForbidden());
        call(
                patch(approvalUrl),
                Map.of(
                        "status",
                        "APPROVED",
                        "note",
                        "Released",
                        "expectedRevision",
                        approval.path("revision").asInt()),
                200);
        call(
                patch(approvalUrl),
                Map.of(
                        "status",
                        "REJECTED",
                        "note",
                        "Again",
                        "expectedRevision",
                        approval.path("revision").asInt() + 1),
                400);
        ObjectNode definition =
                (ObjectNode) call(get("/api/workflows"), null, 200).path("definition").deepCopy();
        for (JsonNode t : definition.path("transitions"))
            if (t.path("from").asText().equals("RECEIVED")
                    && t.path("to").asText().equals("COMPLETED"))
                ((ObjectNode) t)
                        .set(
                                "conditions",
                                mapper.readTree(
                                        "[{\"type\":\"CHECKLIST\",\"field\":\"INSPECT\",\"operator\":\"EQUALS\",\"value\":\"true\"},{\"type\":\"APPROVAL\",\"field\":\"RELEASE\",\"operator\":\"EQUALS\",\"value\":\"true\"}]"));
        publish(definition);
        call(patch("/api/rmas/" + id + "/status"), Map.of("status", "COMPLETED"), 200);
        call(patch("/api/rmas/" + id + "/status"), Map.of("status", "RECEIVED"), 200);
        call(
                post("/api/rmas/" + id + "/approvals"),
                Map.of("code", "RELEASE", "justification", "Review again"),
                201);
        call(patch("/api/rmas/" + id + "/status"), Map.of("status", "COMPLETED"), 400);
    }

    @Test
    void rejectsIncompleteGraphsContradictionsAndMissingChecklistOnPublish() throws Exception {
        ObjectNode definition =
                (ObjectNode) call(get("/api/workflows"), null, 200).path("definition").deepCopy();
        definition.set("transitions", mapper.createArrayNode());
        JsonNode draft = call(post("/api/workflows/draft"), Map.of(), 200);
        JsonNode saved =
                call(
                        put("/api/workflows/draft"),
                        Map.of(
                                "expectedRevision",
                                draft.path("revision").asInt(),
                                "definition",
                                definition),
                        200);
        call(
                post("/api/workflows/publish"),
                Map.of("expectedRevision", saved.path("revision").asInt()),
                400);
        definition =
                (ObjectNode) call(get("/api/workflows"), null, 200).path("definition").deepCopy();
        ObjectNode transition = (ObjectNode) definition.path("transitions").get(0);
        transition.set(
                "conditions",
                mapper.valueToTree(
                        List.of(
                                Map.of(
                                        "type",
                                        "FIELD",
                                        "field",
                                        "invoiceNumber",
                                        "operator",
                                        "EQUALS",
                                        "value",
                                        "A"),
                                Map.of(
                                        "type",
                                        "FIELD",
                                        "field",
                                        "invoiceNumber",
                                        "operator",
                                        "EQUALS",
                                        "value",
                                        "B"))));
        saved =
                call(
                        put("/api/workflows/draft"),
                        Map.of(
                                "expectedRevision",
                                saved.path("revision").asInt(),
                                "definition",
                                definition),
                        200);
        call(
                post("/api/workflows/publish"),
                Map.of("expectedRevision", saved.path("revision").asInt()),
                400);
        transition.set(
                "conditions",
                mapper.valueToTree(
                        List.of(
                                Map.of(
                                        "type",
                                        "CHECKLIST",
                                        "field",
                                        "MISSING",
                                        "operator",
                                        "EQUALS",
                                        "value",
                                        "true"))));
        saved =
                call(
                        put("/api/workflows/draft"),
                        Map.of(
                                "expectedRevision",
                                saved.path("revision").asInt(),
                                "definition",
                                definition),
                        200);
        call(
                post("/api/workflows/publish"),
                Map.of("expectedRevision", saved.path("revision").asInt()),
                400);
        transition.set("conditions", mapper.createArrayNode());
        ((ObjectNode) definition.path("statuses").get(0)).putNull("slaStage");
        saved =
                call(
                        put("/api/workflows/draft"),
                        Map.of(
                                "expectedRevision",
                                saved.path("revision").asInt(),
                                "definition",
                                definition),
                        200);
        call(
                post("/api/workflows/publish"),
                Map.of("expectedRevision", saved.path("revision").asInt()),
                400);
    }

    @Test
    void transitionRoleRestrictionsReturnForbiddenAndDoNotMutate() throws Exception {
        long id = createRma();
        ObjectNode definition =
                (ObjectNode) call(get("/api/workflows"), null, 200).path("definition").deepCopy();
        for (JsonNode t : definition.path("transitions"))
            ((ObjectNode) t).set("roles", mapper.valueToTree(List.of("ADMIN")));
        publish(definition);
        for (String endpoint : List.of("status", "bulk-status"))
            mvc.perform(
                            patch("/api/rmas/" + id + "/" + endpoint)
                                    .with(user("tech").roles("TECHNICIAN"))
                                    .with(csrf())
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            "{\"status\":\"TRIAGE\",\"expectedStatus\":\"RECEIVED\"}"))
                    .andExpect(status().isForbidden());
        assertEquals("RECEIVED", call(get("/api/rmas/" + id), null, 200).path("status").asText());
    }

    @Test
    void draftAcceptsIncompleteEditableLabelsButPublicationRejectsThem() throws Exception {
        ObjectNode definition =
                (ObjectNode) call(get("/api/workflows"), null, 200).path("definition").deepCopy();
        ((ObjectNode) definition.path("statuses").get(0)).put("label", "");
        JsonNode draft = call(post("/api/workflows/draft"), Map.of(), 200);
        JsonNode saved =
                call(
                        put("/api/workflows/draft"),
                        Map.of(
                                "expectedRevision",
                                draft.path("revision").asInt(),
                                "definition",
                                definition),
                        200);
        call(
                post("/api/workflows/publish"),
                Map.of("expectedRevision", saved.path("revision").asInt()),
                400);
    }

    @Test
    void malformedWorkflowAndOperationalPayloadsReturnApiErrors() throws Exception {
        call(post("/api/workflows/publish"), Map.of(), 400);
        JsonNode draft = call(post("/api/workflows/draft"), Map.of(), 200);
        ObjectNode definition =
                (ObjectNode) call(get("/api/workflows"), null, 200).path("definition").deepCopy();
        ((ObjectNode) definition.path("transitions").get(0))
                .set(
                        "actions",
                        mapper.valueToTree(
                                List.of(Map.of("type", "EXECUTE_SCRIPT", "value", "no"))));
        call(
                put("/api/workflows/draft"),
                Map.of(
                        "expectedRevision",
                        draft.path("revision").asInt(),
                        "definition",
                        definition),
                400);
        long id = createRma();
        call(
                post("/api/rmas/" + id + "/approvals"),
                Map.of("code", "RELEASE", "justification", "Check"),
                201);
        call(
                patch("/api/rmas/" + id + "/approvals/1"),
                Map.of("status", "INVALID", "note", "No", "expectedRevision", 1),
                400);
    }

    @Test
    void archivedCardsCanLeaveButNewEntriesAndDeletionInUseAreRejected() throws Exception {
        long id = createRma();
        ObjectNode definition =
                (ObjectNode) call(get("/api/workflows"), null, 200).path("definition").deepCopy();
        definition.put("initialStatus", "TRIAGE");
        ((ObjectNode) definition.path("statuses").get(0)).put("active", false);
        ArrayNode transitions = (ArrayNode) definition.path("transitions");
        for (int i = transitions.size() - 1; i >= 0; i--)
            if (transitions.get(i).path("to").asText().equals("RECEIVED")) transitions.remove(i);
        publish(definition);
        assertEquals("RECEIVED", call(get("/api/rmas/" + id), null, 200).path("status").asText());
        JsonNode draft = call(post("/api/workflows/draft"), Map.of(), 200);
        ObjectNode deleted = definition.deepCopy();
        ((ArrayNode) deleted.path("statuses")).remove(0);
        ArrayNode outgoing = (ArrayNode) deleted.path("transitions");
        for (int i = outgoing.size() - 1; i >= 0; i--)
            if (outgoing.get(i).path("from").asText().equals("RECEIVED")) outgoing.remove(i);
        JsonNode saved =
                call(
                        put("/api/workflows/draft"),
                        Map.of(
                                "expectedRevision",
                                draft.path("revision").asInt(),
                                "definition",
                                deleted),
                        200);
        call(
                post("/api/workflows/publish"),
                Map.of("expectedRevision", saved.path("revision").asInt()),
                400);
        call(patch("/api/rmas/" + id + "/status"), Map.of("status", "TRIAGE"), 200);
        call(patch("/api/rmas/" + id + "/status"), Map.of("status", "RECEIVED"), 400);
    }

    @Test
    void templateVersionsAndNewExecutionsPreserveSnapshotsAndOwnership() throws Exception {
        long id = createRma();
        JsonNode template =
                call(
                        post("/api/checklist-templates"),
                        Map.of(
                                "code",
                                "FINAL",
                                "name",
                                "Final check",
                                "active",
                                true,
                                "items",
                                List.of(
                                        Map.of(
                                                "code",
                                                "CHECK",
                                                "label",
                                                "Original",
                                                "required",
                                                true))),
                        201);
        JsonNode execution =
                call(
                        post("/api/rmas/" + id + "/checklists"),
                        Map.of("templateId", template.path("id").asLong()),
                        201);
        Map<String, Object> update =
                Map.of(
                        "code",
                        "FINAL",
                        "name",
                        "New version",
                        "active",
                        false,
                        "expectedVersion",
                        1,
                        "items",
                        List.of(Map.of("code", "NEW", "label", "New item", "required", true)));
        JsonNode archived =
                call(put("/api/checklist-templates/" + template.path("id").asLong()), update, 200);
        assertEquals(2, archived.path("version").asInt());
        call(put("/api/checklist-templates/" + template.path("id").asLong()), update, 400);
        call(
                post("/api/rmas/" + id + "/checklists"),
                Map.of("templateId", template.path("id").asLong()),
                400);
        assertEquals(
                "Original",
                call(get("/api/rmas/" + id + "/checklists"), null, 200)
                        .get(0)
                        .path("items")
                        .get(0)
                        .path("label")
                        .asText());
        JsonNode completed =
                call(
                        patch(
                                "/api/rmas/"
                                        + id
                                        + "/checklists/"
                                        + execution.path("id").asLong()
                                        + "/items/CHECK"),
                        Map.of(
                                "checked",
                                true,
                                "note",
                                "Verified original snapshot",
                                "expectedRevision",
                                1),
                        200);
        assertTrue(completed.path("completed").asBoolean());
        assertEquals(2, completed.path("history").size());
        call(
                patch(
                        "/api/rmas/999999/checklists/"
                                + execution.path("id").asLong()
                                + "/items/CHECK"),
                Map.of("checked", true, "note", "Wrong owner", "expectedRevision", 2),
                404);
        JsonNode approval =
                call(
                        post("/api/rmas/" + id + "/approvals"),
                        Map.of("code", "FINAL", "justification", "First"),
                        201);
        call(
                post("/api/rmas/" + id + "/approvals"),
                Map.of("code", "FINAL", "justification", "Replacement"),
                201);
        call(
                patch("/api/rmas/" + id + "/approvals/" + approval.path("id").asLong()),
                Map.of("status", "APPROVED", "note", "Superseded", "expectedRevision", 1),
                400);
    }

    @Test
    void relatedRmaValidatesReferencesRevisionAndStatusEvidence() throws Exception {
        long id = createRma();
        Client c = clients.findAll().get(0);
        Product p = products.findAll().get(0);
        long related =
                call(
                                post("/api/rmas"),
                                Map.of(
                                        "clientId",
                                        c.getId(),
                                        "items",
                                        List.of(
                                                Map.of(
                                                        "productId",
                                                        p.getId(),
                                                        "serialNumber",
                                                        "WF-2")),
                                        "purchaseDateUnknown",
                                        true,
                                        "entryDate",
                                        LocalDate.now().toString(),
                                        "reportedFailure",
                                        "Related issue"),
                                201)
                        .path("id")
                        .asLong();
        call(
                patch("/api/rmas/" + id + "/related-rma"),
                Map.of("relatedRmaId", id, "note", "Self"),
                400);
        call(
                patch("/api/rmas/" + id + "/related-rma"),
                Map.of("relatedRmaId", 999999, "note", "Missing"),
                404);
        String old = call(get("/api/rmas/" + id), null, 200).path("updatedAt").asText();
        JsonNode linked =
                call(
                        patch("/api/rmas/" + id + "/related-rma"),
                        Map.of(
                                "relatedRmaId",
                                related,
                                "note",
                                "Replacement device",
                                "expectedUpdatedAt",
                                old),
                        200);
        assertEquals(related, linked.path("relatedRmaId").asLong());
        call(
                patch("/api/rmas/" + id + "/related-rma"),
                Map.of("relatedRmaId", related, "note", "Stale", "expectedUpdatedAt", old),
                400);
        ObjectNode definition =
                (ObjectNode) call(get("/api/workflows"), null, 200).path("definition").deepCopy();
        for (JsonNode t : definition.path("transitions"))
            if (t.path("from").asText().equals("RECEIVED")
                    && t.path("to").asText().equals("COMPLETED"))
                ((ObjectNode) t)
                        .set(
                                "conditions",
                                mapper.valueToTree(
                                        List.of(
                                                Map.of(
                                                        "type",
                                                        "RELATED_STATUS",
                                                        "operator",
                                                        "EQUALS",
                                                        "value",
                                                        "COMPLETED"))));
        publish(definition);
        call(patch("/api/rmas/" + id + "/status"), Map.of("status", "COMPLETED"), 400);
        call(patch("/api/rmas/" + related + "/status"), Map.of("status", "TRIAGE"), 200);
        call(patch("/api/rmas/" + related + "/status"), Map.of("status", "COMPLETED"), 200);
        call(
                patch("/api/rmas/" + id + "/bulk-status"),
                Map.of("status", "COMPLETED", "expectedStatus", "RECEIVED"),
                200);
    }

    @Test
    void defaultsPreserveEveryLegacyStatusLabelExactly() throws Exception {
        JsonNode statuses =
                call(get("/api/workflows"), null, 200).path("definition").path("statuses");
        List<String> labels =
                List.of(
                        "Recebido",
                        "Triagem",
                        "Diagn\u00f3stico",
                        "Aguardando pe\u00e7a",
                        "Reparo",
                        "Testes",
                        "Conclu\u00eddo",
                        "Devolvido",
                        "Sem conserto");
        for (int i = 0; i < labels.size(); i++)
            assertEquals(labels.get(i), statuses.get(i).path("label").asText());
    }

    @Test
    void publishedChecklistMustStayActiveAndInactiveReferencesCannotPublish() throws Exception {
        JsonNode template =
                call(
                        post("/api/checklist-templates"),
                        Map.of(
                                "code",
                                "ACTIVE_RULE",
                                "name",
                                "Active rule",
                                "active",
                                false,
                                "items",
                                List.of(
                                        Map.of(
                                                "code",
                                                "CHECK",
                                                "label",
                                                "Check",
                                                "required",
                                                true))),
                        201);
        ObjectNode definition =
                (ObjectNode) call(get("/api/workflows"), null, 200).path("definition").deepCopy();
        ((ObjectNode) definition.path("transitions").get(0))
                .set(
                        "conditions",
                        mapper.valueToTree(
                                List.of(
                                        Map.of(
                                                "type",
                                                "CHECKLIST",
                                                "field",
                                                "ACTIVE_RULE",
                                                "operator",
                                                "EQUALS",
                                                "value",
                                                "true"))));
        JsonNode draft = call(post("/api/workflows/draft"), Map.of(), 200);
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
                400);
        String url = "/api/checklist-templates/" + template.path("id").asLong();
        Map<String, Object> active =
                Map.of(
                        "code",
                        "ACTIVE_RULE",
                        "name",
                        "Active rule",
                        "active",
                        true,
                        "expectedVersion",
                        1,
                        "items",
                        List.of(Map.of("code", "CHECK", "label", "Check", "required", true)));
        call(put(url), active, 200);
        publish(definition);
        Map<String, Object> archived =
                Map.of(
                        "code",
                        "ACTIVE_RULE",
                        "name",
                        "Active rule",
                        "active",
                        false,
                        "expectedVersion",
                        2,
                        "items",
                        List.of(Map.of("code", "CHECK", "label", "Check", "required", true)));
        call(put(url), archived, 400);
    }

    @Test
    void inUseArchivedNonterminalStatusMustRetainPathToDone() throws Exception {
        createRma();
        ObjectNode definition =
                (ObjectNode) call(get("/api/workflows"), null, 200).path("definition").deepCopy();
        definition.put("initialStatus", "TRIAGE");
        ((ObjectNode) definition.path("statuses").get(0)).put("active", false);
        ArrayNode transitions = (ArrayNode) definition.path("transitions");
        for (int i = transitions.size() - 1; i >= 0; i--) {
            JsonNode transition = transitions.get(i);
            if (transition.path("from").asText().equals("RECEIVED")
                    || transition.path("to").asText().equals("RECEIVED")) transitions.remove(i);
        }
        JsonNode draft = call(post("/api/workflows/draft"), Map.of(), 200);
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
                400);
        assertEquals(1, call(get("/api/workflows"), null, 200).path("version").asInt());
    }

    @Test
    void unusedArchivedStatusesMayHaveNoOutgoingEdges() throws Exception {
        ObjectNode definition =
                (ObjectNode) call(get("/api/workflows"), null, 200).path("definition").deepCopy();
        ((ObjectNode) definition.path("statuses").get(1)).put("active", false);
        ArrayNode transitions = (ArrayNode) definition.path("transitions");
        for (int i = transitions.size() - 1; i >= 0; i--) {
            JsonNode transition = transitions.get(i);
            if (transition.path("from").asText().equals("TRIAGE")
                    || transition.path("to").asText().equals("TRIAGE")) transitions.remove(i);
        }
        publish(definition);
    }

    @Test
    void inUseArchivedDoneStatusDoesNotRequireReopening() throws Exception {
        long id = createRma();
        call(patch("/api/rmas/" + id + "/status"), Map.of("status", "COMPLETED"), 200);
        ObjectNode definition =
                (ObjectNode) call(get("/api/workflows"), null, 200).path("definition").deepCopy();
        ((ObjectNode) definition.path("statuses").get(6)).put("active", false);
        ArrayNode transitions = (ArrayNode) definition.path("transitions");
        for (int i = transitions.size() - 1; i >= 0; i--) {
            JsonNode transition = transitions.get(i);
            if (transition.path("from").asText().equals("COMPLETED")
                    || transition.path("to").asText().equals("COMPLETED")) transitions.remove(i);
        }
        publish(definition);
        JsonNode rma = call(get("/api/rmas/" + id), null, 200);
        assertEquals("COMPLETED", rma.path("status").asText());
        assertEquals("CLOSED", rma.path("sla").path("status").asText());
    }

    private void publish(ObjectNode definition) throws Exception {
        JsonNode draft = call(post("/api/workflows/draft"), Map.of(), 200);
        JsonNode saved =
                call(
                        put("/api/workflows/draft"),
                        Map.of(
                                "expectedRevision",
                                draft.path("revision").asInt(),
                                "definition",
                                definition),
                        200);
        call(
                post("/api/workflows/publish"),
                Map.of("expectedRevision", saved.path("revision").asInt()),
                200);
    }

    private long createRma() throws Exception {
        Client c = new Client();
        c.setLegalName("Workflow client");
        c = clients.save(c);
        Product p = new Product();
        p.setSku("WF-TEST");
        p.setName("Workflow product");
        p.setDefaultWarrantyMonths(12);
        p = products.save(p);
        return call(
                        post("/api/rmas"),
                        Map.of(
                                "clientId",
                                c.getId(),
                                "items",
                                List.of(Map.of("productId", p.getId(), "serialNumber", "WF-1")),
                                "purchaseDateUnknown",
                                true,
                                "entryDate",
                                LocalDate.now().toString(),
                                "reportedFailure",
                                "Does not start"),
                        201)
                .path("id")
                .asLong();
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
