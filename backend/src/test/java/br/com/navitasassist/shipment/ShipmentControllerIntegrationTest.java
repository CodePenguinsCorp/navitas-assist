package br.com.navitasassist.shipment;

import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.Map;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.ProductRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.service.ShipmentService;
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
class ShipmentControllerIntegrationTest {

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

    @Autowired
    private ShipmentService shipmentService;

    @BeforeEach
    @AfterEach
    void cleanData() {
        jdbcTemplate.update("DELETE FROM rma_shipment_events");
        jdbcTemplate.update("DELETE FROM rma_shipments");
        rmaRecordRepository.deleteAll();
        productRepository.deleteAll();
        clientRepository.deleteAll();
    }

    @Test
    void shouldKeepSeveralShipmentsPerRmaWithLogisticCosts() throws Exception {
        Long rmaId = saveRma("RMA-SHIP-1");

        createShipment(rmaId, "PICKUP", "Correios", "BR123", "10.50").andExpect(status().isCreated())
            .andExpect(jsonPath("$.shipment.status").value("LABEL_ISSUED"))
            .andExpect(jsonPath("$.shipment.trackingCode").value("BR123"))
            .andExpect(jsonPath("$.events", hasSize(1)))
            .andExpect(jsonPath("$.events[0].source").value("SYSTEM"))
            .andExpect(jsonPath("$.events[0].recordedBy").value("desk"));
        createShipment(rmaId, "RETURN", "Jadlog", null, "20.25").andExpect(status().isCreated())
            .andExpect(jsonPath("$.shipment.status").value("CREATED"));

        mockMvc.perform(get("/api/shipments").param("rmaId", String.valueOf(rmaId)).with(user("desk").roles("SERVICE_DESK")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(2)));

        mockMvc.perform(get("/api/shipments/rma/{rmaId}/summary", rmaId).with(user("tech").roles("TECHNICIAN")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.shipmentCount").value(2))
            .andExpect(jsonPath("$.totalCost").value(30.75));

        createShipment(rmaId, "POSTING", "correios", "br123", null)
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Tracking code already registered for this carrier: BR123"));
    }

    @Test
    void shouldRestrictAddressesAndWritesToAuthorizedRoles() throws Exception {
        Long rmaId = saveRma("RMA-SHIP-2");
        long shipmentId = shipmentId(createShipment(rmaId, "PICKUP", "Correios", "BR200", null));

        mockMvc.perform(get("/api/shipments/{id}", shipmentId).with(user("desk").roles("SERVICE_DESK")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.shipment.originAddress").value("Rua do Cliente, 10"))
            .andExpect(jsonPath("$.shipment.addressRestricted").value(false));

        for (String role : new String[] { "TECHNICIAN", "VIEWER" }) {
            mockMvc.perform(get("/api/shipments/{id}", shipmentId).with(user("other").roles(role)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.shipment.originAddress").doesNotExist())
                .andExpect(jsonPath("$.shipment.destinationAddress").doesNotExist())
                .andExpect(jsonPath("$.shipment.addressRestricted").value(true));
            mockMvc.perform(get("/api/shipments").with(user("other").roles(role)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].originAddress").doesNotExist());
        }

        mockMvc.perform(post("/api/shipments")
                .with(user("tech").roles("TECHNICIAN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(shipmentJson(rmaId, "PICKUP", "Correios", null, null)))
            .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/shipments/{id}", shipmentId)).andExpect(status().isUnauthorized());

        mockMvc.perform(delete("/api/shipments/{id}", shipmentId).with(user("admin").roles("ADMIN")).with(csrf()))
            .andExpect(status().isForbidden());
    }

    @Test
    void shouldProcessRepeatedCarrierEventsIdempotently() throws Exception {
        Long rmaId = saveRma("RMA-SHIP-3");
        long shipmentId = shipmentId(createShipment(rmaId, "POSTING", "Correios", "BR300", null));
        Instant transitAt = Instant.now().minus(2, ChronoUnit.HOURS);

        ingest("correios", "br300", "EVT-1", "IN_TRANSIT", transitAt, "admin", "ADMIN")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.duplicate").value(false))
            .andExpect(jsonPath("$.status").value("IN_TRANSIT"));
        ingest("Correios", "BR300", "EVT-1", "IN_TRANSIT", transitAt, "admin", "ADMIN")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.duplicate").value(true));

        ingest("Correios", "BR300", "EVT-0", "LABEL_ISSUED", transitAt.minus(1, ChronoUnit.DAYS), "admin", "ADMIN")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.duplicate").value(false))
            .andExpect(jsonPath("$.status").value("IN_TRANSIT"));

        ingest("Correios", "BR300", "EVT-2", "DELIVERY_ATTEMPT", transitAt.plus(1, ChronoUnit.HOURS), "desk", "SERVICE_DESK")
            .andExpect(status().isForbidden());

        ingest("Correios", "UNKNOWN", "EVT-3", "IN_TRANSIT", transitAt, "admin", "ADMIN").andExpect(status().isNotFound());

        mockMvc.perform(get("/api/shipments/{id}", shipmentId).with(user("desk").roles("SERVICE_DESK")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.shipment.status").value("IN_TRANSIT"))
            .andExpect(jsonPath("$.events", hasSize(3)))
            .andExpect(jsonPath("$.events[?(@.externalEventId == 'EVT-1')]", hasSize(1)))
            .andExpect(jsonPath("$.events[?(@.source == 'INTEGRATION')]", hasSize(2)));
    }

    @Test
    void shouldKeepManualOperationWhenCarrierIsUnavailableAndAuditAuthorAndJustification() throws Exception {
        Long rmaId = saveRma("RMA-SHIP-4");
        long shipmentId = shipmentId(createShipment(rmaId, "RETURN", "Transportadora X", "TX400", "15.00"));

        mockMvc.perform(post("/api/shipments/{id}/sync", shipmentId).with(user("desk").roles("SERVICE_DESK")).with(csrf()))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.message").value("No carrier integration is configured. Register tracking events manually."));

        manualEvent(shipmentId, "DELIVERY_ATTEMPT", null, "desk")
            .andExpect(status().isBadRequest());

        manualEvent(shipmentId, "DELIVERY_ATTEMPT", "Transportadora fora do ar; cliente ausente", "desk")
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.shipment.status").value("DELIVERY_ATTEMPT"))
            .andExpect(jsonPath("$.shipment.deliveryAttempts").value(1))
            .andExpect(jsonPath("$.events[0].source").value("MANUAL"))
            .andExpect(jsonPath("$.events[0].recordedBy").value("desk"))
            .andExpect(jsonPath("$.events[0].justification").value("Transportadora fora do ar; cliente ausente"))
            .andExpect(jsonPath("$.events[0].proofReference").value("COMP-1"));

        Map<String, Object> update = shipmentPayload(rmaId, "RETURN", "Transportadora X", "TX400", "18.40");
        update.remove("rmaId");
        mockMvc.perform(put("/api/shipments/{id}", shipmentId)
                .with(user("desk").roles("SERVICE_DESK"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(update)))
            .andExpect(status().isBadRequest());

        update.put("justification", "Frete reajustado na fatura");
        mockMvc.perform(put("/api/shipments/{id}", shipmentId)
                .with(user("admin").roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(update)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.shipment.cost").value(18.40))
            .andExpect(jsonPath("$.shipment.status").value("DELIVERY_ATTEMPT"))
            .andExpect(jsonPath("$.events[0].description").value("Shipment data updated: cost"))
            .andExpect(jsonPath("$.events[0].recordedBy").value("admin"))
            .andExpect(jsonPath("$.events[0].justification").value("Frete reajustado na fatura"));
    }

    @Test
    void shouldPurgeAddressesAfterRetentionPeriod() throws Exception {
        Long rmaId = saveRma("RMA-SHIP-5");
        long oldId = shipmentId(createShipment(rmaId, "RETURN", "Correios", "BR500", null));
        long recentId = shipmentId(createShipment(rmaId, "RETURN", "Correios", "BR501", null));
        ingest("Correios", "BR500", "EVT-OLD", "DELIVERED", Instant.now().minus(400, ChronoUnit.DAYS), "admin", "ADMIN").andExpect(status().isOk());
        ingest("Correios", "BR501", "EVT-NEW", "DELIVERED", Instant.now().minus(1, ChronoUnit.DAYS), "admin", "ADMIN").andExpect(status().isOk());

        assertEquals(1, shipmentService.purgeExpiredAddresses(Instant.now()));

        mockMvc.perform(get("/api/shipments/{id}", oldId).with(user("admin").roles("ADMIN")))
            .andExpect(jsonPath("$.shipment.originAddress").doesNotExist())
            .andExpect(jsonPath("$.shipment.addressesPurged").value(true))
            .andExpect(jsonPath("$.shipment.originName").value("Cliente"));
        mockMvc.perform(get("/api/shipments/{id}", recentId).with(user("admin").roles("ADMIN")))
            .andExpect(jsonPath("$.shipment.originAddress").value("Rua do Cliente, 10"))
            .andExpect(jsonPath("$.shipment.addressesPurged").value(false));
    }

    private ResultActions createShipment(Long rmaId, String type, String carrier, String trackingCode, String cost) throws Exception {
        return mockMvc.perform(post("/api/shipments")
            .with(user("desk").roles("SERVICE_DESK"))
            .with(csrf())
            .contentType(MediaType.APPLICATION_JSON)
            .content(shipmentJson(rmaId, type, carrier, trackingCode, cost)));
    }

    private ResultActions ingest(String carrier, String trackingCode, String eventId, String status, Instant occurredAt, String username, String role) throws Exception {
        Map<String, Object> payload = new HashMap<>();
        payload.put("carrier", carrier);
        payload.put("trackingCode", trackingCode);
        payload.put("externalEventId", eventId);
        payload.put("status", status);
        payload.put("occurredAt", occurredAt.toString());
        return mockMvc.perform(post("/api/shipments/events/ingest")
            .with(user(username).roles(role))
            .with(csrf())
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(payload)));
    }

    private ResultActions manualEvent(long shipmentId, String status, String justification, String username) throws Exception {
        Map<String, Object> payload = new HashMap<>();
        payload.put("status", status);
        payload.put("description", "Tentativa sem sucesso");
        payload.put("proofReference", "COMP-1");
        payload.put("justification", justification);
        return mockMvc.perform(post("/api/shipments/{id}/events", shipmentId)
            .with(user(username).roles("SERVICE_DESK"))
            .with(csrf())
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(payload)));
    }

    private long shipmentId(ResultActions result) throws Exception {
        String response = result.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response).get("shipment").get("id").asLong();
    }

    private String shipmentJson(Long rmaId, String type, String carrier, String trackingCode, String cost) throws Exception {
        return objectMapper.writeValueAsString(shipmentPayload(rmaId, type, carrier, trackingCode, cost));
    }

    private Map<String, Object> shipmentPayload(Long rmaId, String type, String carrier, String trackingCode, String cost) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("rmaId", rmaId);
        payload.put("type", type);
        payload.put("originName", "Cliente");
        payload.put("originAddress", "Rua do Cliente, 10");
        payload.put("destinationName", "Laboratório Navitas");
        payload.put("destinationAddress", "Av. Navitas, 100");
        payload.put("volumes", 2);
        payload.put("carrier", carrier);
        payload.put("serviceName", "Expresso");
        payload.put("trackingCode", trackingCode);
        payload.put("cost", cost == null ? null : new java.math.BigDecimal(cost));
        return payload;
    }

    private Long saveRma(String code) {
        Client client = new Client();
        client.setLegalName("Cliente " + code);
        Product product = new Product();
        product.setSku(code);
        product.setName("Produto " + code);
        product.setDefaultWarrantyMonths(12);
        RmaRecord rma = new RmaRecord();
        rma.setCode(code);
        rma.setClient(clientRepository.save(client));
        rma.setProduct(productRepository.save(product));
        rma.getItemIdentification().setSerialNumber(code);
        rma.setPurchaseDateUnknown(true);
        rma.setEntryDate(LocalDate.now(BUSINESS_ZONE));
        rma.setReceivedBy("Service desk");
        rma.setReportedFailure("Shipment test");
        return rmaRecordRepository.saveAndFlush(rma).getId();
    }
}
