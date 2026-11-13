package br.com.navitasassist.rma;

import static br.com.navitasassist.access.AccessTestSupport.asProfile;
import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.diagnosis.Diagnosis;
import br.com.navitasassist.diagnosis.FailureType;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.ProductRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class RmaReportSummaryIntegrationTest {
    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private RmaRecordRepository rmas;
    @Autowired private ClientRepository clients;
    @Autowired private ProductRepository products;
    private Client alfa;
    private Client beta;
    private Product controller;
    private Product sensor;

    @BeforeEach
    void setUp() {
        rmas.deleteAll();
        products.deleteAll();
        clients.deleteAll();
        alfa = client("Cliente Alfa");
        beta = client("Cliente Beta");
        controller = product("CTRL-1", "Controlador");
        sensor = product("SENS-1", "Sensor");
    }

    @Test
    void countsStatusEffectiveWarrantyAndMonthsOfThePeriod() throws Exception {
        RmaRecord first = rma("RMA-1", "2026-09-10", RmaStatus.RECEIVED, alfa, item(controller, "S1", "L1"), item(controller, "S2", "L1"));
        first.setPurchaseDateUnknown(false);
        first.setPurchaseDate(LocalDate.parse("2026-01-10"));
        first.getItems().get(1).setWarrantyOverride(WarrantyStatus.OUT_OF_WARRANTY);
        first.getItems().get(1).setWarrantyOverrideReason("Lacre rompido");
        first.getItems().get(1).setWarrantyOverrideBy("admin");
        first.getItems().get(1).setWarrantyOverrideAt(Instant.parse("2026-09-11T10:00:00Z"));
        rmas.saveAndFlush(first);
        rma("RMA-2", "2026-10-05", RmaStatus.RETURNED, beta, item(sensor, "S9", null));
        rma("RMA-OUT", "2026-08-31", RmaStatus.RECEIVED, alfa, item(sensor, "S8", null));

        mockMvc.perform(get("/api/reports/rmas/summary").param("entryFrom", "2026-09-01").param("entryTo", "2026-10-31")
                .with(asProfile("viewer", "VIEWER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.generatedAt").isNotEmpty())
            .andExpect(jsonPath("$.entryFrom").value("2026-09-01"))
            .andExpect(jsonPath("$.totalRmas").value(2))
            .andExpect(jsonPath("$.totalItems").value(3))
            .andExpect(jsonPath("$.byStatus", hasSize(2)))
            .andExpect(jsonPath("$.byStatus[0].key").value("RECEIVED"))
            .andExpect(jsonPath("$.byStatus[0].label").value("Recebido"))
            .andExpect(jsonPath("$.byStatus[1].key").value("RETURNED"))
            .andExpect(jsonPath("$.byWarranty", hasSize(3)))
            .andExpect(jsonPath("$.byWarranty[0].key").value("IN_WARRANTY"))
            .andExpect(jsonPath("$.byWarranty[0].count").value(1))
            .andExpect(jsonPath("$.byWarranty[1].key").value("OUT_OF_WARRANTY"))
            .andExpect(jsonPath("$.byWarranty[1].count").value(1))
            .andExpect(jsonPath("$.byWarranty[2].key").value("PENDING"))
            .andExpect(jsonPath("$.byWarranty[2].count").value(1))
            .andExpect(jsonPath("$.byMonth", hasSize(2)))
            .andExpect(jsonPath("$.byMonth[0].key").value("2026-09"))
            .andExpect(jsonPath("$.byMonth[0].label").value("09/2026"))
            .andExpect(jsonPath("$.byMonth[0].count").value(1))
            .andExpect(jsonPath("$.byMonth[1].count").value(1));
    }

    @Test
    void ranksFailuresByProductBatchClientAndFailureType() throws Exception {
        RmaRecord first = rma("RMA-1", "2026-10-01", RmaStatus.IN_DIAGNOSIS, alfa, item(controller, "S1", "L1"), item(controller, "S2", "L1"));
        diagnose(first, FailureType.SENSOR);
        RmaRecord second = rma("RMA-2", "2026-10-02", RmaStatus.IN_DIAGNOSIS, alfa, item(controller, "S3", "L2"));
        diagnose(second, FailureType.SENSOR);
        rma("RMA-3", "2026-10-03", RmaStatus.IN_DIAGNOSIS, beta, item(sensor, "S4", "L1"));

        mockMvc.perform(get("/api/reports/rmas/summary").param("entryFrom", "2026-10-01").param("entryTo", "2026-10-31")
                .with(asProfile("admin", "ADMIN")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.topProducts[0].label").value("Controlador (CTRL-1)"))
            .andExpect(jsonPath("$.topProducts[0].count").value(3))
            .andExpect(jsonPath("$.topProducts[1].count").value(1))
            .andExpect(jsonPath("$.topBatches", hasSize(3)))
            .andExpect(jsonPath("$.topBatches[0].label").value("L1 · Controlador (CTRL-1)"))
            .andExpect(jsonPath("$.topBatches[0].count").value(2))
            .andExpect(jsonPath("$.topClients[0].label").value("Cliente Alfa"))
            .andExpect(jsonPath("$.topClients[0].count").value(3))
            .andExpect(jsonPath("$.topFailureTypes", hasSize(1)))
            .andExpect(jsonPath("$.topFailureTypes[0].key").value("SENSOR"))
            .andExpect(jsonPath("$.topFailureTypes[0].label").value("Sensor"))
            .andExpect(jsonPath("$.topFailureTypes[0].count").value(2));
    }

    @Test
    void countsReturnsAgainstEarlierRmasOfTheSameProductAndSerial() throws Exception {
        rma("RMA-OLD", "2026-05-01", RmaStatus.RETURNED, beta, item(controller, "S1", "L1"));
        rma("RMA-NEW", "2026-10-01", RmaStatus.RECEIVED, alfa, item(controller, "S1", "L1"), item(controller, "S2", "L1"), item(controller, "", "L1"));
        rma("RMA-OTHER-PRODUCT", "2026-10-02", RmaStatus.RECEIVED, alfa, item(sensor, "S2", null));
        rma("RMA-LATER", "2026-11-20", RmaStatus.RECEIVED, alfa, item(controller, "S2", "L1"));

        mockMvc.perform(get("/api/reports/rmas/summary").param("entryFrom", "2026-10-01").param("entryTo", "2026-10-31")
                .with(asProfile("admin", "ADMIN")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.recurrence.itemsWithSerial").value(3))
            .andExpect(jsonPath("$.recurrence.returnedItems").value(1))
            .andExpect(jsonPath("$.recurrence.byProduct", hasSize(1)))
            .andExpect(jsonPath("$.recurrence.byProduct[0].label").value("Controlador (CTRL-1)"))
            .andExpect(jsonPath("$.recurrence.byProduct[0].items").value(2))
            .andExpect(jsonPath("$.recurrence.byProduct[0].returnedItems").value(1))
            .andExpect(jsonPath("$.recurrence.byBatch[0].label").value("L1 · Controlador (CTRL-1)"))
            .andExpect(jsonPath("$.recurrence.serials", hasSize(1)))
            .andExpect(jsonPath("$.recurrence.serials[0].serialNumber").value("S1"))
            .andExpect(jsonPath("$.recurrence.serials[0].productName").value("Controlador"))
            .andExpect(jsonPath("$.recurrence.serials[0].rmaCount").value(2));
    }

    @Test
    void countsRecurrenceRegardlessOfSerialCase() throws Exception {
        rma("RMA-OLD", "2026-05-01", RmaStatus.RETURNED, beta, item(controller, "abc1", "L1"));
        rma("RMA-NEW", "2026-10-01", RmaStatus.RECEIVED, alfa, item(controller, "ABC1", "L1"));

        mockMvc.perform(get("/api/reports/rmas/summary").param("entryFrom", "2026-10-01").param("entryTo", "2026-10-31")
                .with(asProfile("admin", "ADMIN")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.recurrence.itemsWithSerial").value(1))
            .andExpect(jsonPath("$.recurrence.returnedItems").value(1))
            .andExpect(jsonPath("$.recurrence.serials", hasSize(1)))
            .andExpect(jsonPath("$.recurrence.serials[0].serialNumber").value("ABC1"))
            .andExpect(jsonPath("$.recurrence.serials[0].rmaCount").value(2));
    }

    @Test
    void measuresTheCurrentStageOfOpenRmasAtTheReportInstant() throws Exception {
        Instant entered = Instant.parse("2026-10-20T23:30:00Z");
        RmaRecord open = rma("RMA-OPEN", "2026-10-20", RmaStatus.IN_DIAGNOSIS, alfa, item(controller, "S1", null));
        history(open, RmaStatus.RECEIVED, entered.minusSeconds(3600));
        history(open, RmaStatus.IN_DIAGNOSIS, entered);
        history(open, RmaStatus.IN_DIAGNOSIS, entered.plusSeconds(1800));
        rmas.saveAndFlush(open);
        RmaRecord closed = rma("RMA-CLOSED", "2026-10-20", RmaStatus.COMPLETED, alfa, item(controller, "S2", null));
        history(closed, RmaStatus.COMPLETED, entered);
        rmas.saveAndFlush(closed);

        var result = mockMvc.perform(get("/api/reports/rmas/summary").param("entryFrom", "2026-10-01").param("entryTo", "2026-10-31")
                .with(asProfile("admin", "ADMIN")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.stages", hasSize(1)))
            .andExpect(jsonPath("$.stages[0].status").value("IN_DIAGNOSIS"))
            .andExpect(jsonPath("$.stages[0].label").value("Diagnóstico"))
            .andExpect(jsonPath("$.stages[0].count").value(1))
            .andReturn();
        var body = objectMapper.readTree(result.getResponse().getContentAsString());
        long expected = Duration.between(entered, Instant.parse(body.get("generatedAt").asText())).getSeconds();
        assertEquals(expected, body.at("/stages/0/averageSeconds").asLong());
        assertEquals(expected, body.at("/stages/0/maximumSeconds").asLong());
    }

    @Test
    void appliesTheSameFiltersAndPermissionsAsTheList() throws Exception {
        rma("RMA-1", "2026-10-01", RmaStatus.RECEIVED, alfa, item(controller, "S1", null));
        rma("RMA-2", "2026-10-01", RmaStatus.RECEIVED, beta, item(controller, "S2", null));
        mockMvc.perform(get("/api/reports/rmas/summary").param("entryFrom", "2026-10-01").param("entryTo", "2026-10-31")
                .param("clientId", beta.getId().toString()).with(asProfile("admin", "ADMIN")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.totalRmas").value(1));
        mockMvc.perform(get("/api/reports/rmas/summary").param("entryFrom", "2026-10-21").param("entryTo", "2026-10-20")
                .with(asProfile("admin", "ADMIN")))
            .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/reports/rmas/summary")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/reports/rmas/summary").with(asProfile("desk", "SERVICE_DESK"))).andExpect(status().isForbidden());
    }

    private Client client(String name) {
        Client client = new Client();
        client.setLegalName(name);
        return clients.save(client);
    }

    private Product product(String sku, String name) {
        Product product = new Product();
        product.setSku(sku);
        product.setName(name);
        return products.save(product);
    }

    private RmaItem item(Product product, String serial, String batch) {
        RmaItem item = new RmaItem();
        item.setProduct(product);
        item.getItemIdentification().setSerialNumber(serial);
        item.getItemIdentification().setBatchNumber(batch);
        return item;
    }

    private RmaRecord rma(String code, String entryDate, RmaStatus status, Client owner, RmaItem... items) {
        RmaRecord rma = new RmaRecord();
        rma.setCode(code);
        rma.setClient(owner);
        rma.setProduct(items[0].getProduct());
        rma.setEntryDate(LocalDate.parse(entryDate));
        rma.setPurchaseDateUnknown(true);
        rma.setReceivedBy("admin");
        rma.setReportedFailure("Não liga");
        rma.setStatus(status);
        rma.replaceItems(List.of(items));
        return rmas.saveAndFlush(rma);
    }

    private void diagnose(RmaRecord rma, FailureType type) {
        Diagnosis diagnosis = new Diagnosis();
        diagnosis.setFoundFailure("Falha");
        diagnosis.setFailureType(type);
        diagnosis.setDiagnosedAt(rma.getEntryDate());
        diagnosis.setTechnicianName("Técnico");
        rma.setDiagnosis(diagnosis);
        rmas.saveAndFlush(rma);
    }

    private void history(RmaRecord rma, RmaStatus status, Instant changedAt) {
        RmaStatusHistory event = new RmaStatusHistory();
        event.setStatus(status);
        event.setChangedBy("admin");
        event.setChangedAt(changedAt);
        rma.addStatusHistory(event);
    }
}
