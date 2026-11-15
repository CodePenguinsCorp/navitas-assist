package br.com.navitasassist.part;

import static br.com.navitasassist.access.AccessTestSupport.asProfile;
import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.PartMovementRepository;
import br.com.navitasassist.repository.PartRepository;
import br.com.navitasassist.repository.PartUsageRepository;
import br.com.navitasassist.repository.ProductRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.rma.RmaItem;
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
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PartInventoryIntegrationTest {

    private static final RequestPostProcessor ADMIN = asProfile("admin", "ADMIN");
    private static final RequestPostProcessor SERVICE_DESK = asProfile("desk", "SERVICE_DESK");
    private static final RequestPostProcessor TECHNICIAN = asProfile("tech", "TECHNICIAN");
    private static final RequestPostProcessor VIEWER = asProfile("viewer", "VIEWER");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private PartRepository partRepository;

    @Autowired
    private PartUsageRepository partUsageRepository;

    @Autowired
    private PartMovementRepository partMovementRepository;

    @Autowired
    private RmaRecordRepository rmaRecordRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private ClientRepository clientRepository;

    private RmaRecord rma;

    @BeforeEach
    void setUp() {
        cleanUp();
        rma = createRma("OS-PART-0001", RmaStatus.IN_DIAGNOSIS);
    }

    @AfterEach
    void cleanUp() {
        partMovementRepository.findAll().stream().filter(movement -> movement.getReversedMovement() != null).forEach(partMovementRepository::delete);
        partMovementRepository.deleteAll();
        partUsageRepository.deleteAll();
        partRepository.deleteAll();
        rmaRecordRepository.deleteAll();
        productRepository.deleteAll();
        clientRepository.deleteAll();
    }

    @Test
    void shouldCreatePartWithDecimalCostAndZeroBalance() throws Exception {
        mockMvc.perform(post("/api/parts").with(SERVICE_DESK).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(partPayload("PCA-001", "12.35", "2"))))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.code").value("PCA-001"))
            .andExpect(jsonPath("$.unit").value("un"))
            .andExpect(jsonPath("$.location").value("Prateleira A1"))
            .andExpect(jsonPath("$.unitCost").value(12.35))
            .andExpect(jsonPath("$.onHand").value(0))
            .andExpect(jsonPath("$.belowMinimum").value(true))
            .andExpect(jsonPath("$.active").value(true));
    }

    @Test
    void shouldRejectDuplicatedPartCode() throws Exception {
        createPart("PCA-DUP", "1.00", "0");

        mockMvc.perform(post("/api/parts").with(ADMIN).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(partPayload("pca-dup", "1.00", "0"))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Código de peça já cadastrado: pca-dup"));
    }

    @Test
    void shouldRequireReasonForAdjustment() throws Exception {
        long partId = createPart("PCA-ADJ", "10.00", "0");

        movement(partId, "ADJUSTMENT", "3", null, ADMIN)
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Informe o motivo do ajuste de estoque."));

        movement(partId, "ADJUSTMENT", "3", "Contagem física", ADMIN)
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.type").value("ADJUSTMENT"))
            .andExpect(jsonPath("$.quantity").value(3))
            .andExpect(jsonPath("$.onHandChange").value(3));
    }

    @Test
    void usesImmediatelyAndReversesOnceWithReason() throws Exception {
        long partId = createPart("PCA-USE", "12.35", "1");
        movement(partId, "ENTRY", "5", null, ADMIN).andExpect(status().isCreated());
        long usageId = id(use(rma.getId(), partId, "2", TECHNICIAN).andExpect(status().isCreated())
            .andExpect(jsonPath("$.status").value("USED")).andExpect(jsonPath("$.partOnHand").value(3)));
        mockMvc.perform(get("/api/rmas/{id}/parts", rma.getId()).with(VIEWER))
            .andExpect(jsonPath("$.usages", hasSize(1))).andExpect(jsonPath("$.usedCost").value(24.70));
        String path = "/api/rmas/" + rma.getId() + "/parts/usages/" + usageId + "/reversal";
        mockMvc.perform(post(path).with(TECHNICIAN).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isBadRequest());
        mockMvc.perform(post(path).with(TECHNICIAN).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json(Map.of("reason", "Correção"))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("REVERTED"));
        mockMvc.perform(post(path).with(TECHNICIAN).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json(Map.of("reason", "Correção"))))
            .andExpect(status().isBadRequest());
        assertEquals(0, partRepository.findById(partId).orElseThrow().getOnHand().compareTo(new BigDecimal("5")));
        assertEquals(3, partMovementRepository.findByPart_IdOrderByIdDesc(partId).size());
    }

    @Test
    void insufficientStockCreatesNeitherUsageNorMovement() throws Exception {
        long partId = createPart("PCA-LOW", "1.00", "2");
        use(rma.getId(), partId, "1", TECHNICIAN).andExpect(status().isConflict())
            .andExpect(jsonPath("$.message").value("Estoque insuficiente para a peça PCA-LOW. Em estoque: 0."));
        assertEquals(0, partUsageRepository.count());
        assertEquals(0, partMovementRepository.count());
        mockMvc.perform(get("/api/parts/replenishment").with(VIEWER)).andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    void validatesMetadataAndMasksCostsForTechnician() throws Exception {
        long partId = createPart("PCA-META", "10.00", "0");
        movement(partId, "ENTRY", "2", null, ADMIN).andExpect(status().isCreated());
        String path = "/api/rmas/" + rma.getId() + "/parts/usages";
        mockMvc.perform(post(path).with(TECHNICIAN).with(csrf()).contentType(MediaType.APPLICATION_JSON)
            .content(json(Map.of("partId", partId, "quantity", 1, "replacementReason", "  ")))).andExpect(status().isBadRequest());
        mockMvc.perform(post(path).with(TECHNICIAN).with(csrf()).contentType(MediaType.APPLICATION_JSON)
            .content(json(Map.of("partId", partId, "quantity", 1, "replacementReason", " Curto ", "componentBatch", " L1 ", "notes", " Teste "))))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.replacementReason").value("Curto"))
            .andExpect(jsonPath("$.componentBatch").value("L1")).andExpect(jsonPath("$.notes").value("Teste"))
            .andExpect(jsonPath("$.unitCost").doesNotExist()).andExpect(jsonPath("$.appliedBy").value("tech"));
        mockMvc.perform(get("/api/rmas/{id}", rma.getId()).with(VIEWER)).andExpect(jsonPath("$.repairHistory[0].summary")
            .value("Peça usada: Peça PCA-META (código: PCA-META), 1 un. Motivo da troca: Curto. Lote: L1."));
    }

    @Test
    void refusesClosedOrdersInactivePartsFractionsAndWrongPermission() throws Exception {
        long partId = createPart("PCA-GUARD", "1.00", "0");
        movement(partId, "ENTRY", "5", null, ADMIN).andExpect(status().isCreated());
        use(rma.getId(), partId, "1.5", TECHNICIAN).andExpect(status().isBadRequest());
        use(rma.getId(), partId, "1", VIEWER).andExpect(status().isForbidden());
        Part part = partRepository.findById(partId).orElseThrow(); part.setActive(false); partRepository.saveAndFlush(part);
        use(rma.getId(), partId, "1", TECHNICIAN).andExpect(status().isBadRequest());
        part.setActive(true); partRepository.saveAndFlush(part);
        long usage = id(use(rma.getId(), partId, "1", TECHNICIAN));
        rma.setStatus(RmaStatus.COMPLETED); rmaRecordRepository.saveAndFlush(rma);
        use(rma.getId(), partId, "1", TECHNICIAN).andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/rmas/{id}/parts/usages/{usage}/reversal", rma.getId(), usage).with(TECHNICIAN).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content(json(Map.of("reason", "Correção")))).andExpect(status().isBadRequest());
    }

    private RmaRecord createRma(String code, RmaStatus status) {
        Product product = productRepository.findAll().stream().findFirst().orElseGet(() -> {
            Product created = new Product();
            created.setSku("SKU-PARTS");
            created.setName("Produto com peças");
            return productRepository.save(created);
        });
        Client client = clientRepository.findAll().stream().findFirst().orElseGet(() -> {
            Client created = new Client();
            created.setLegalName("Cliente peças");
            return clientRepository.save(created);
        });
        RmaRecord record = new RmaRecord();
        record.setCode(code);
        record.setProduct(product);
        record.setClient(client);
        record.setEntryDate(LocalDate.now());
        record.setReceivedBy("Teste");
        record.setReportedFailure("Falha");
        record.setStatus(status);
        RmaItem item = new RmaItem();
        item.setProduct(product);
        item.getItemIdentification().setSerialNumber("SER-" + code);
        record.addItem(item);
        return rmaRecordRepository.save(record);
    }

    private long createPart(String code, String unitCost, String minimumStock) throws Exception {
        return id(mockMvc.perform(post("/api/parts").with(ADMIN).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(partPayload(code, unitCost, minimumStock))))
            .andExpect(status().isCreated()));
    }

    private Map<String, Object> partPayload(String code, String unitCost, String minimumStock) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("code", code);
        payload.put("name", "Peça " + code);
        payload.put("unit", "un");
        payload.put("location", "Prateleira A1");
        payload.put("minimumStock", new BigDecimal(minimumStock));
        payload.put("unitCost", new BigDecimal(unitCost));
        return payload;
    }

    private org.springframework.test.web.servlet.ResultActions movement(long partId, String type, String quantity, String reason, RequestPostProcessor role) throws Exception {
        Map<String, Object> payload = new HashMap<>();
        payload.put("type", type);
        payload.put("quantity", new BigDecimal(quantity));
        payload.put("reason", reason);
        return mockMvc.perform(post("/api/parts/{id}/movements", partId).with(role).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json(payload)));
    }

    private org.springframework.test.web.servlet.ResultActions reverse(long movementId, String reason, RequestPostProcessor role) throws Exception {
        return mockMvc.perform(post("/api/parts/movements/{id}/reversal", movementId).with(role).with(csrf())
            .contentType(MediaType.APPLICATION_JSON)
            .content(json(Map.of("reason", reason))));
    }

    private org.springframework.test.web.servlet.ResultActions use(long rmaId, long partId, String quantity, RequestPostProcessor role) throws Exception {
        return mockMvc.perform(post("/api/rmas/{id}/parts/usages", rmaId).with(role).with(csrf())
            .contentType(MediaType.APPLICATION_JSON)
            .content(json(Map.of("partId", partId, "quantity", new BigDecimal(quantity), "replacementReason", "Falha confirmada"))));
    }

    private long id(org.springframework.test.web.servlet.ResultActions result) throws Exception {
        JsonNode body = objectMapper.readTree(result.andReturn().getResponse().getContentAsString());
        return body.get("id").asLong();
    }

    private String json(Object value) throws Exception {
        return objectMapper.writeValueAsString(value);
    }
}
