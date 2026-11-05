package br.com.navitasassist.part;

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
import br.com.navitasassist.repository.PartReservationRepository;
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

    private static final RequestPostProcessor ADMIN = user("admin").roles("ADMIN");
    private static final RequestPostProcessor SERVICE_DESK = user("desk").roles("SERVICE_DESK");
    private static final RequestPostProcessor TECHNICIAN = user("tech").roles("TECHNICIAN");
    private static final RequestPostProcessor VIEWER = user("viewer").roles("VIEWER");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private PartRepository partRepository;

    @Autowired
    private PartReservationRepository partReservationRepository;

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
        rma = createRma("RMA-PART-0001", RmaStatus.IN_DIAGNOSIS);
    }

    @AfterEach
    void cleanUp() {
        partMovementRepository.findAll().stream().filter(movement -> movement.getReversedMovement() != null).forEach(partMovementRepository::delete);
        partMovementRepository.deleteAll();
        partReservationRepository.deleteAll();
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
            .andExpect(jsonPath("$.available").value(0))
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
            .andExpect(jsonPath("$.message").value("Part code already registered: pca-dup"));
    }

    @Test
    void shouldReserveWithoutConsumingBalanceAndReduceAvailability() throws Exception {
        long partId = createPart("PCA-RES", "10.00", "0");
        movement(partId, "ENTRY", "5", null, ADMIN).andExpect(status().isCreated());

        reserve(rma.getId(), partId, "2", TECHNICIAN)
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.status").value("ACTIVE"))
            .andExpect(jsonPath("$.partAvailable").value(3));

        mockMvc.perform(get("/api/parts/{id}", partId).with(VIEWER))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.onHand").value(5))
            .andExpect(jsonPath("$.reserved").value(2))
            .andExpect(jsonPath("$.available").value(3));
    }

    @Test
    void shouldNotAllowExitThatWouldConsumeReservedStock() throws Exception {
        long partId = createPart("PCA-EXIT", "10.00", "0");
        movement(partId, "ENTRY", "5", null, ADMIN).andExpect(status().isCreated());
        reserve(rma.getId(), partId, "4", TECHNICIAN).andExpect(status().isCreated());

        movement(partId, "EXIT", "2", null, ADMIN)
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Insufficient available stock for part PCA-EXIT. Available: 1"));

        movement(partId, "ADJUSTMENT", "-2", "Inventário", ADMIN).andExpect(status().isBadRequest());
        movement(partId, "EXIT", "1", null, ADMIN).andExpect(status().isCreated()).andExpect(jsonPath("$.onHandAfter").value(4));
    }

    @Test
    void shouldRequireReasonForAdjustment() throws Exception {
        long partId = createPart("PCA-ADJ", "10.00", "0");

        movement(partId, "ADJUSTMENT", "3", null, ADMIN)
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("A reason is required for stock adjustments."));

        movement(partId, "ADJUSTMENT", "3", "Contagem física", ADMIN)
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.type").value("ADJUSTMENT"))
            .andExpect(jsonPath("$.quantity").value(3))
            .andExpect(jsonPath("$.onHandChange").value(3));
    }

    @Test
    void shouldKeepReservationPendingWhenStockIsInsufficientAndAllocateAfterEntry() throws Exception {
        long partId = createPart("PCA-PEND", "10.00", "1");
        movement(partId, "ENTRY", "1", null, ADMIN).andExpect(status().isCreated());

        long reservationId = id(reserve(rma.getId(), partId, "3", TECHNICIAN)
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.status").value("PENDING")));

        mockMvc.perform(get("/api/parts/pending").with(VIEWER))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].rmaCode").value("RMA-PART-0001"));

        mockMvc.perform(get("/api/parts/replenishment").with(VIEWER))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].code").value("PCA-PEND"))
            .andExpect(jsonPath("$[0].pendingQuantity").value(3))
            .andExpect(jsonPath("$[0].suggestedQuantity").value(3));

        action(rma.getId(), reservationId, "allocate", TECHNICIAN).andExpect(status().isBadRequest());

        movement(partId, "ENTRY", "4", null, ADMIN).andExpect(status().isCreated());
        action(rma.getId(), reservationId, "allocate", TECHNICIAN)
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("ACTIVE"))
            .andExpect(jsonPath("$.partAvailable").value(2));
    }

    @Test
    void shouldReturnAvailabilityWhenReservationIsCancelled() throws Exception {
        long partId = createPart("PCA-CANCEL", "10.00", "0");
        movement(partId, "ENTRY", "5", null, ADMIN).andExpect(status().isCreated());
        long reservationId = id(reserve(rma.getId(), partId, "5", TECHNICIAN).andExpect(status().isCreated()));

        action(rma.getId(), reservationId, "cancel", TECHNICIAN)
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("CANCELLED"))
            .andExpect(jsonPath("$.partAvailable").value(5));

        action(rma.getId(), reservationId, "cancel", TECHNICIAN).andExpect(status().isBadRequest());

        mockMvc.perform(get("/api/parts/{id}/movements", partId).with(VIEWER))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].type").value("RESERVATION_CANCEL"))
            .andExpect(jsonPath("$[0].reservedChange").value(-5))
            .andExpect(jsonPath("$[1].type").value("RESERVATION"));
    }

    @Test
    void shouldConsumeReservationAndExposeCostsInRma() throws Exception {
        long partId = createPart("PCA-CONS", "12.35", "0");
        long otherPartId = createPart("PCA-OTHER", "7.10", "0");
        movement(partId, "ENTRY", "5", null, ADMIN).andExpect(status().isCreated());
        movement(otherPartId, "ENTRY", "1", null, ADMIN).andExpect(status().isCreated());
        long consumedId = id(reserve(rma.getId(), partId, "3", TECHNICIAN).andExpect(status().isCreated()));
        reserve(rma.getId(), otherPartId, "1", TECHNICIAN).andExpect(status().isCreated());
        reserve(rma.getId(), otherPartId, "2", TECHNICIAN).andExpect(jsonPath("$.status").value("PENDING"));

        action(rma.getId(), consumedId, "consume", TECHNICIAN)
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("CONSUMED"))
            .andExpect(jsonPath("$.unitCost").value(12.35))
            .andExpect(jsonPath("$.totalCost").value(37.05));

        mockMvc.perform(get("/api/parts/{id}", partId).with(VIEWER))
            .andExpect(jsonPath("$.onHand").value(2))
            .andExpect(jsonPath("$.reserved").value(0))
            .andExpect(jsonPath("$.available").value(2));

        mockMvc.perform(get("/api/rmas/{id}/parts", rma.getId()).with(VIEWER))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.rmaCode").value("RMA-PART-0001"))
            .andExpect(jsonPath("$.reservations", hasSize(3)))
            .andExpect(jsonPath("$.reservations[0].status").value("CONSUMED"))
            .andExpect(jsonPath("$.reservations[1].status").value("ACTIVE"))
            .andExpect(jsonPath("$.reservations[2].status").value("PENDING"))
            .andExpect(jsonPath("$.consumedCost").value(37.05))
            .andExpect(jsonPath("$.reservedCost").value(7.10))
            .andExpect(jsonPath("$.pendingCount").value(1))
            .andExpect(jsonPath("$.movements[0].type").value("CONSUMPTION"))
            .andExpect(jsonPath("$.movements[0].rmaCode").value("RMA-PART-0001"));
    }

    @Test
    void shouldCorrectConsumptionOnlyThroughAuditableReversal() throws Exception {
        long partId = createPart("PCA-REV", "10.00", "0");
        movement(partId, "ENTRY", "5", null, ADMIN).andExpect(status().isCreated());
        long reservationId = id(reserve(rma.getId(), partId, "2", TECHNICIAN).andExpect(status().isCreated()));
        action(rma.getId(), reservationId, "consume", TECHNICIAN).andExpect(status().isOk());
        long consumptionId = partMovementRepository.findFirstByReservation_IdAndTypeOrderByIdDesc(reservationId, PartMovementType.CONSUMPTION).orElseThrow().getId();

        reverse(consumptionId, "", ADMIN).andExpect(status().isBadRequest());

        reverse(consumptionId, "Peça não utilizada", SERVICE_DESK)
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.type").value("REVERSAL"))
            .andExpect(jsonPath("$.reversedMovementId").value(consumptionId))
            .andExpect(jsonPath("$.onHandChange").value(2))
            .andExpect(jsonPath("$.rmaCode").value("RMA-PART-0001"))
            .andExpect(jsonPath("$.createdBy").value("desk"))
            .andExpect(jsonPath("$.reason").value("Peça não utilizada"));

        reverse(consumptionId, "De novo", ADMIN)
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Movement has already been reversed: " + consumptionId));

        mockMvc.perform(get("/api/parts/{id}", partId).with(VIEWER)).andExpect(jsonPath("$.onHand").value(5));

        mockMvc.perform(get("/api/rmas/{id}/parts", rma.getId()).with(VIEWER))
            .andExpect(jsonPath("$.reservations[0].status").value("REVERSED"))
            .andExpect(jsonPath("$.consumedCost").value(0))
            .andExpect(jsonPath("$.movements[0].type").value("REVERSAL"))
            .andExpect(jsonPath("$.movements[1].type").value("CONSUMPTION"))
            .andExpect(jsonPath("$.movements[1].reversed").value(true));

        assertEquals(4, partMovementRepository.findByPart_IdOrderByIdDesc(partId).size());
    }

    @Test
    void shouldReverseEntryOnlyWhenStockIsStillAvailable() throws Exception {
        long partId = createPart("PCA-REV-IN", "10.00", "0");
        long entryId = id(movement(partId, "ENTRY", "3", null, ADMIN).andExpect(status().isCreated()));
        reserve(rma.getId(), partId, "2", TECHNICIAN).andExpect(status().isCreated());

        reverse(entryId, "Lançamento duplicado", ADMIN)
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Insufficient available stock for part PCA-REV-IN. Available: 1"));
    }

    @Test
    void shouldNotReverseReservationMovements() throws Exception {
        long partId = createPart("PCA-REV-RES", "10.00", "0");
        movement(partId, "ENTRY", "3", null, ADMIN).andExpect(status().isCreated());
        long reservationId = id(reserve(rma.getId(), partId, "1", TECHNICIAN));
        long reservationMovementId = partMovementRepository.findFirstByReservation_IdAndTypeOrderByIdDesc(reservationId, PartMovementType.RESERVATION).orElseThrow().getId();

        reverse(reservationMovementId, "Teste", ADMIN)
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Reservation movements are corrected by cancelling the reservation."));
    }

    @Test
    void shouldRejectReservationForClosedRma() throws Exception {
        RmaRecord closed = createRma("RMA-PART-0002", RmaStatus.COMPLETED);
        long partId = createPart("PCA-CLOSED", "10.00", "0");
        movement(partId, "ENTRY", "3", null, ADMIN).andExpect(status().isCreated());

        reserve(closed.getId(), partId, "1", TECHNICIAN)
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Parts cannot be reserved for a closed RMA."));
    }

    @Test
    void shouldDistinguishQueryReservationAndAdjustmentPermissions() throws Exception {
        long partId = createPart("PCA-PERM", "10.00", "0");

        mockMvc.perform(get("/api/parts")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/parts").with(VIEWER)).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(1)));
        mockMvc.perform(get("/api/rmas/{id}/parts", rma.getId()).with(VIEWER)).andExpect(status().isOk());

        mockMvc.perform(post("/api/parts").with(TECHNICIAN).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json(partPayload("PCA-X", "1", "0"))))
            .andExpect(status().isForbidden());
        mockMvc.perform(put("/api/parts/{id}", partId).with(VIEWER).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json(partPayload("PCA-PERM", "1", "0"))))
            .andExpect(status().isForbidden());
        movement(partId, "ENTRY", "5", null, TECHNICIAN).andExpect(status().isForbidden());
        movement(partId, "ENTRY", "5", null, VIEWER).andExpect(status().isForbidden());
        movement(partId, "ENTRY", "5", null, SERVICE_DESK).andExpect(status().isCreated());
        reverse(1L, "Teste", TECHNICIAN).andExpect(status().isForbidden());

        reserve(rma.getId(), partId, "1", VIEWER).andExpect(status().isForbidden());
        reserve(rma.getId(), partId, "1", SERVICE_DESK).andExpect(status().isForbidden());
        long reservationId = id(reserve(rma.getId(), partId, "1", TECHNICIAN).andExpect(status().isCreated()));
        action(rma.getId(), reservationId, "consume", VIEWER).andExpect(status().isForbidden());
        action(rma.getId(), reservationId, "cancel", SERVICE_DESK).andExpect(status().isForbidden());
        action(rma.getId(), reservationId, "cancel", ADMIN).andExpect(status().isOk());
    }

    @Test
    void shouldUpdatePartRegistrationWithoutChangingBalances() throws Exception {
        long partId = createPart("PCA-UPD", "10.00", "0");
        movement(partId, "ENTRY", "5", null, ADMIN).andExpect(status().isCreated());
        Map<String, Object> payload = partPayload("PCA-UPD", "11.50", "1");
        payload.put("location", "Gaveta B2");
        payload.put("active", false);

        mockMvc.perform(put("/api/parts/{id}", partId).with(ADMIN).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json(payload)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.location").value("Gaveta B2"))
            .andExpect(jsonPath("$.unitCost").value(11.5))
            .andExpect(jsonPath("$.onHand").value(5))
            .andExpect(jsonPath("$.active").value(false));

        reserve(rma.getId(), partId, "1", TECHNICIAN)
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Part is inactive: PCA-UPD"));
    }

    @Test
    void openReservationsBlockClosingTheRmaUntilConsumedOrCancelled() throws Exception {
        long partId = createPart("PCA-CLOSE", "10.00", "0");
        movement(partId, "ENTRY", "2", null, ADMIN).andExpect(status().isCreated());
        long active = id(reserve(rma.getId(), partId, "1", TECHNICIAN).andExpect(jsonPath("$.status").value("ACTIVE")));
        long pending = id(reserve(rma.getId(), partId, "5", TECHNICIAN).andExpect(jsonPath("$.status").value("PENDING")));

        changeStatus(rma.getId(), "IRREPARABLE")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("RMA has open part reservations. Consume or cancel them before closing."));

        action(rma.getId(), active, "consume", TECHNICIAN).andExpect(status().isOk());
        changeStatus(rma.getId(), "COMPLETED").andExpect(status().isBadRequest());

        action(rma.getId(), pending, "cancel", TECHNICIAN).andExpect(status().isOk());
        changeStatus(rma.getId(), "COMPLETED").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COMPLETED"));
        changeStatus(rma.getId(), "RETURNED").andExpect(status().isOk());
    }

    @Test
    void closedRmaReservationsCanOnlyBeCancelled() throws Exception {
        long partId = createPart("PCA-CLOSED-RES", "10.00", "0");
        movement(partId, "ENTRY", "1", null, ADMIN).andExpect(status().isCreated());
        long active = id(reserve(rma.getId(), partId, "1", TECHNICIAN));
        long pending = id(reserve(rma.getId(), partId, "3", TECHNICIAN));
        RmaRecord closed = rmaRecordRepository.findById(rma.getId()).orElseThrow();
        closed.setStatus(RmaStatus.COMPLETED);
        rmaRecordRepository.save(closed);

        action(rma.getId(), active, "consume", TECHNICIAN)
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Parts cannot be allocated or consumed for a closed RMA."));
        action(rma.getId(), pending, "allocate", TECHNICIAN).andExpect(status().isBadRequest());

        action(rma.getId(), active, "cancel", TECHNICIAN).andExpect(status().isOk()).andExpect(jsonPath("$.partAvailable").value(1));
        action(rma.getId(), pending, "cancel", TECHNICIAN).andExpect(status().isOk());
    }

    @Test
    void pendingReservationOfAnInactivePartCannotBeAllocated() throws Exception {
        long partId = createPart("PCA-INACTIVE", "10.00", "0");
        long pending = id(reserve(rma.getId(), partId, "1", TECHNICIAN).andExpect(jsonPath("$.status").value("PENDING")));
        movement(partId, "ENTRY", "5", null, ADMIN).andExpect(status().isCreated());
        Map<String, Object> payload = partPayload("PCA-INACTIVE", "10.00", "0");
        payload.put("active", false);
        mockMvc.perform(put("/api/parts/{id}", partId).with(ADMIN).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json(payload))).andExpect(status().isOk());

        action(rma.getId(), pending, "allocate", TECHNICIAN)
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Part is inactive: PCA-INACTIVE"));
    }

    private org.springframework.test.web.servlet.ResultActions changeStatus(long rmaId, String status) throws Exception {
        return mockMvc.perform(patch("/api/rmas/{id}/status", rmaId).with(TECHNICIAN).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json(Map.of("status", status))));
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

    private org.springframework.test.web.servlet.ResultActions reserve(long rmaId, long partId, String quantity, RequestPostProcessor role) throws Exception {
        return mockMvc.perform(post("/api/rmas/{id}/parts", rmaId).with(role).with(csrf())
            .contentType(MediaType.APPLICATION_JSON)
            .content(json(Map.of("partId", partId, "quantity", new BigDecimal(quantity)))));
    }

    private org.springframework.test.web.servlet.ResultActions action(long rmaId, long reservationId, String action, RequestPostProcessor role) throws Exception {
        return mockMvc.perform(post("/api/rmas/{id}/parts/{reservationId}/{action}", rmaId, reservationId, action).with(role).with(csrf()));
    }

    private long id(org.springframework.test.web.servlet.ResultActions result) throws Exception {
        JsonNode body = objectMapper.readTree(result.andReturn().getResponse().getContentAsString());
        return body.get("id").asLong();
    }

    private String json(Object value) throws Exception {
        return objectMapper.writeValueAsString(value);
    }
}
