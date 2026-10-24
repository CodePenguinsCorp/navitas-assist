package br.com.navitasassist.protocol;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.ProductRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.rma.RmaRecord;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ProtocolControllerIntegrationTest {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Sao_Paulo");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ClientRepository clientRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private RmaRecordRepository rmaRecordRepository;

    private Product product;

    @BeforeEach
    void prepareData() {
        cleanData();
        product = saveProduct("PROT-1", "Controlador PWM", "Controladores");
    }

    @AfterEach
    void cleanData() {
        jdbcTemplate.update("DELETE FROM rma_protocol_item_results");
        jdbcTemplate.update("DELETE FROM rma_protocol_executions");
        jdbcTemplate.update("DELETE FROM protocol_template_items");
        jdbcTemplate.update("DELETE FROM protocol_template_versions");
        jdbcTemplate.update("DELETE FROM protocol_templates");
        jdbcTemplate.update("DELETE FROM rma_status_history");
        rmaRecordRepository.deleteAll();
        productRepository.deleteAll();
        clientRepository.deleteAll();
    }

    @Test
    void shouldManageVersionedTemplatesOnlyAsAdminAndValidateMeasurements() throws Exception {
        mockMvc.perform(post("/api/protocols/templates")
                .with(user("tech").roles("TECHNICIAN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(templateJson("Teste", product.getId(), null, List.of(checkItem("Inspeção", true)))))
            .andExpect(status().isForbidden());

        Map<String, Object> invalid = measurementItem("Tensão", true, null, 2, null, null);
        createTemplate(templateJson("Sem unidade", product.getId(), null, List.of(invalid)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Measurement items require a unit and a number of decimal places: Tensão"));

        createTemplate(templateJson("Sem escopo", null, " ", List.of(checkItem("Inspeção", true))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Inform a product or a category for the protocol."));

        long templateId = templateId(createTemplate(templateJson("Bancada PWM", product.getId(), null,
            List.of(measurementItem("Tensão de saída", true, "V", 2, "11.50", "12.50")))));

        mockMvc.perform(get("/api/protocols/templates/{id}", templateId).with(user("viewer").roles("VIEWER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.currentVersion").value(1))
            .andExpect(jsonPath("$.items[0].unit").value("V"))
            .andExpect(jsonPath("$.items[0].decimalPlaces").value(2))
            .andExpect(jsonPath("$.items[0].minValue").value(11.5));

        mockMvc.perform(delete("/api/protocols/templates/{id}", templateId).with(user("admin").roles("ADMIN")).with(csrf()))
            .andExpect(status().isForbidden());
    }

    @Test
    void shouldFreezeStartedExecutionsWhenTemplateChanges() throws Exception {
        Long rmaId = saveRma("RMA-PROT-1", product);
        long templateId = templateId(createTemplate(templateJson("Inspeção visual", null, "controladores", List.of(checkItem("Carcaça", true)))));
        JsonNode execution = startExecution(rmaId, templateId, "tech", "TECHNICIAN");
        long executionId = execution.get("id").asLong();

        mockMvc.perform(put("/api/protocols/templates/{id}", templateId)
                .with(user("admin").roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(templateJson("Inspeção visual revisada", null, "Controladores", List.of(checkItem("Carcaça", true), checkItem("Conectores", true)))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.currentVersion").value(2))
            .andExpect(jsonPath("$.items", hasSize(2)));

        mockMvc.perform(get("/api/protocols/rmas/{rmaId}/executions", rmaId).with(user("viewer").roles("VIEWER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].id").value(executionId))
            .andExpect(jsonPath("$[0].templateName").value("Inspeção visual"))
            .andExpect(jsonPath("$[0].versionNumber").value(1))
            .andExpect(jsonPath("$[0].startedBy").value("tech"))
            .andExpect(jsonPath("$[0].items", hasSize(1)));

        mockMvc.perform(post("/api/protocols/rmas/{rmaId}/executions", rmaId)
                .with(user("tech").roles("TECHNICIAN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"templateId\":" + templateId + "}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("This protocol is already in progress for the RMA."));

        Product other = saveProduct("PROT-2", "Sensor", "Sensores");
        Long otherRmaId = saveRma("RMA-PROT-2", other);
        mockMvc.perform(post("/api/protocols/rmas/{rmaId}/executions", otherRmaId)
                .with(user("tech").roles("TECHNICIAN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"templateId\":" + templateId + "}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("This protocol does not apply to the products of the RMA."));

        mockMvc.perform(post("/api/protocols/rmas/{rmaId}/executions", rmaId)
                .with(user("viewer").roles("VIEWER"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"templateId\":" + templateId + "}"))
            .andExpect(status().isForbidden());
    }

    @Test
    void shouldValidateRequiredFieldsAndPreserveMeasurementUnitAndPrecision() throws Exception {
        Long rmaId = saveRma("RMA-PROT-3", product);
        Map<String, Object> evidenceItem = checkItem("Foto da placa", true);
        evidenceItem.put("evidenceRequired", true);
        Map<String, Object> textItem = checkItem("Observação", true);
        textItem.put("type", "TEXT");
        long templateId = templateId(createTemplate(templateJson("Teste elétrico", product.getId(), null,
            List.of(measurementItem("Tensão de saída", true, "V", 2, "11.50", "12.50"), evidenceItem, textItem, checkItem("Opcional", false)))));
        JsonNode execution = startExecution(rmaId, templateId, "tech", "TECHNICIAN");
        long executionId = execution.get("id").asLong();
        long voltageId = itemId(execution, 0);
        long evidenceId = itemId(execution, 1);
        long textId = itemId(execution, 2);

        complete(executionId)
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Required items are pending: Tensão de saída, Foto da placa, Observação"));

        result(executionId, voltageId, "PASSED", "12.505", null, null, null).andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Measurement must use at most 2 decimal places: Tensão de saída"));
        result(executionId, voltageId, "PASSED", "13.00", null, null, null).andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Measurement outside the expected range cannot pass: Tensão de saída"));
        result(executionId, voltageId, "PASSED", null, null, null, null).andExpect(status().isBadRequest());
        result(executionId, evidenceId, "PASSED", null, null, null, null).andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Evidence is required: Foto da placa"));
        result(executionId, textId, "PASSED", null, " ", null, null).andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Text result is required: Observação"));

        result(executionId, voltageId, "PASSED", "12.5", null, null, null)
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.items[0].latest.measuredValue").value("12.50"))
            .andExpect(jsonPath("$.items[0].latest.unit").value("V"))
            .andExpect(jsonPath("$.items[0].latest.executedBy").value("tech"));
        result(executionId, evidenceId, "PASSED", null, null, "FOTO-123", null).andExpect(status().isCreated());
        result(executionId, textId, "PASSED", null, "Sem oxidação", null, null)
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.pendingRequiredItems").value(0))
            .andExpect(jsonPath("$.completedItems").value(3))
            .andExpect(jsonPath("$.totalItems").value(4));

        complete(executionId)
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("COMPLETED"))
            .andExpect(jsonPath("$.completedBy").value("tech"));

        result(executionId, voltageId, "PASSED", "12.00", null, null, "Nova medição").andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Finished protocol executions cannot receive new results. Start a new execution."));
    }

    @Test
    void shouldKeepRepetitionHistoryWithJustification() throws Exception {
        Long rmaId = saveRma("RMA-PROT-4", product);
        long templateId = templateId(createTemplate(templateJson("Teste funcional", product.getId(), null, List.of(checkItem("Liga", true)))));
        JsonNode execution = startExecution(rmaId, templateId, "tech", "TECHNICIAN");
        long executionId = execution.get("id").asLong();
        long itemId = itemId(execution, 0);

        result(executionId, itemId, "FAILED", null, null, null, null).andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Failed or not applicable items require a justification."));
        result(executionId, itemId, "FAILED", null, null, null, "Não ligou na primeira tentativa").andExpect(status().isCreated())
            .andExpect(jsonPath("$.failedItems").value(1));
        result(executionId, itemId, "PASSED", null, null, null, null).andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Repeating an item requires a justification."));
        result(executionId, itemId, "PASSED", null, null, null, "Fusível substituído")
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.items[0].latest.attempt").value(2))
            .andExpect(jsonPath("$.items[0].latest.outcome").value("PASSED"))
            .andExpect(jsonPath("$.items[0].attempts", hasSize(2)))
            .andExpect(jsonPath("$.items[0].attempts[0].outcome").value("FAILED"))
            .andExpect(jsonPath("$.items[0].attempts[0].justification").value("Não ligou na primeira tentativa"))
            .andExpect(jsonPath("$.failedItems").value(0));
    }

    @Test
    void shouldBlockConfiguredRmaTransitionsWhileRequiredItemsArePending() throws Exception {
        Long rmaId = saveRma("RMA-PROT-5", product);
        Map<String, Object> template = templatePayload("Reparo", product.getId(), null, List.of(checkItem("Solda revisada", true)));
        template.put("blockedStatuses", List.of("IN_TESTS", "COMPLETED"));
        long templateId = templateId(createTemplate(objectMapper.writeValueAsString(template)));
        JsonNode execution = startExecution(rmaId, templateId, "tech", "TECHNICIAN");

        changeStatus(rmaId, "IN_REPAIR").andExpect(status().isOk());
        changeStatus(rmaId, "IN_TESTS")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Required items of protocol Reparo v1 are pending. The RMA cannot move to IN_TESTS."));

        result(execution.get("id").asLong(), itemId(execution, 0), "FAILED", null, null, null, "Solda fria").andExpect(status().isCreated());
        changeStatus(rmaId, "IN_TESTS").andExpect(status().isBadRequest());

        result(execution.get("id").asLong(), itemId(execution, 0), "PASSED", null, null, null, "Ressoldado").andExpect(status().isCreated());
        changeStatus(rmaId, "IN_TESTS").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("IN_TESTS"));
    }

    private ResultActions createTemplate(String json) throws Exception {
        return mockMvc.perform(post("/api/protocols/templates")
            .with(user("admin").roles("ADMIN"))
            .with(csrf())
            .contentType(MediaType.APPLICATION_JSON)
            .content(json));
    }

    private JsonNode startExecution(Long rmaId, long templateId, String username, String role) throws Exception {
        String response = mockMvc.perform(post("/api/protocols/rmas/{rmaId}/executions", rmaId)
                .with(user(username).roles(role))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"templateId\":" + templateId + "}"))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response);
    }

    private ResultActions result(long executionId, long itemId, String outcome, String measuredValue, String textValue, String evidence, String justification) throws Exception {
        Map<String, Object> payload = new HashMap<>();
        payload.put("outcome", outcome);
        payload.put("measuredValue", measuredValue == null ? null : new BigDecimal(measuredValue));
        payload.put("textValue", textValue);
        payload.put("evidence", evidence);
        payload.put("justification", justification);
        return mockMvc.perform(post("/api/protocols/executions/{executionId}/items/{itemId}/results", executionId, itemId)
            .with(user("tech").roles("TECHNICIAN"))
            .with(csrf())
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(payload)));
    }

    private ResultActions complete(long executionId) throws Exception {
        return mockMvc.perform(post("/api/protocols/executions/{executionId}/complete", executionId).with(user("tech").roles("TECHNICIAN")).with(csrf()));
    }

    private ResultActions changeStatus(Long rmaId, String status) throws Exception {
        return mockMvc.perform(patch("/api/rmas/{id}/status", rmaId)
            .with(user("tech").roles("TECHNICIAN"))
            .with(csrf())
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"status\":\"" + status + "\"}"));
    }

    private long templateId(ResultActions result) throws Exception {
        String response = result.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response).get("id").asLong();
    }

    private long itemId(JsonNode execution, int index) {
        return execution.get("items").get(index).get("item").get("id").asLong();
    }

    private String templateJson(String name, Long productId, String category, List<Map<String, Object>> items) throws Exception {
        return objectMapper.writeValueAsString(templatePayload(name, productId, category, items));
    }

    private Map<String, Object> templatePayload(String name, Long productId, String category, List<Map<String, Object>> items) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("name", name);
        payload.put("productId", productId);
        payload.put("category", category);
        payload.put("active", true);
        payload.put("items", new ArrayList<>(items));
        return payload;
    }

    private Map<String, Object> checkItem(String title, boolean required) {
        Map<String, Object> item = new HashMap<>();
        item.put("stepName", "Inspeção");
        item.put("title", title);
        item.put("type", "CHECK");
        item.put("required", required);
        item.put("evidenceRequired", false);
        return item;
    }

    private Map<String, Object> measurementItem(String title, boolean required, String unit, Integer decimalPlaces, String min, String max) {
        Map<String, Object> item = checkItem(title, required);
        item.put("stepName", "Medições");
        item.put("type", "MEASUREMENT");
        item.put("unit", unit);
        item.put("decimalPlaces", decimalPlaces);
        item.put("minValue", min == null ? null : new BigDecimal(min));
        item.put("maxValue", max == null ? null : new BigDecimal(max));
        item.put("expectedResult", "Entre 11,50 V e 12,50 V");
        return item;
    }

    private Product saveProduct(String sku, String name, String category) {
        Product saved = new Product();
        saved.setSku(sku);
        saved.setName(name);
        saved.setCategory(category);
        saved.setDefaultWarrantyMonths(12);
        return productRepository.save(saved);
    }

    private Long saveRma(String code, Product rmaProduct) {
        Client client = new Client();
        client.setLegalName("Cliente " + code);
        RmaRecord rma = new RmaRecord();
        rma.setCode(code);
        rma.setClient(clientRepository.save(client));
        rma.setProduct(rmaProduct);
        rma.getItemIdentification().setSerialNumber(code);
        rma.setPurchaseDateUnknown(true);
        rma.setEntryDate(LocalDate.now(BUSINESS_ZONE));
        rma.setReceivedBy("Service desk");
        rma.setReportedFailure("Protocol test");
        rma.setStatus(RmaStatus.IN_DIAGNOSIS);
        return rmaRecordRepository.saveAndFlush(rma).getId();
    }
}
