package br.com.navitasassist.rma;

import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import br.com.navitasassist.client.Client;
import br.com.navitasassist.diagnosis.Diagnosis;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.ProductRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
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
class RmaReportIntegrationTest {
    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private EntityManager entityManager;
    @Autowired private RmaRecordRepository rmas;
    @Autowired private ClientRepository clients;
    @Autowired private ProductRepository products;
    private Client client;
    private Product product;

    @BeforeEach
    void setUp() {
        rmas.deleteAll();
        products.deleteAll();
        clients.deleteAll();
        client = new Client();
        client.setLegalName("Cliente de relatórios");
        clients.save(client);
        product = new Product();
        product.setSku("REPORT-1");
        product.setName("Controlador");
        products.save(product);
    }

    @Test
    void combinesFiltersWithInclusiveCivilDatesAndStableOrdering() throws Exception {
        saveRma("RMA-START", "2026-10-01", RmaStatus.RECEIVED, client);
        saveRma("RMA-END", "2026-10-20", RmaStatus.RECEIVED, client);
        saveRma("RMA-END-2", "2026-10-20", RmaStatus.RECEIVED, client);
        saveRma("RMA-BEFORE", "2026-09-30", RmaStatus.RECEIVED, client);
        saveRma("RMA-AFTER", "2026-10-21", RmaStatus.RECEIVED, client);
        saveRma("RMA-STATUS", "2026-10-10", RmaStatus.RETURNED, client);
        Client other = new Client();
        other.setLegalName("Outro cliente");
        clients.save(other);
        saveRma("RMA-OTHER", "2026-10-10", RmaStatus.RECEIVED, other);

        mockMvc.perform(get("/api/reports/rmas").with(user("viewer").roles("VIEWER"))
                .param("entryFrom", "2026-10-01").param("entryTo", "2026-10-20")
                .param("status", "RECEIVED").param("clientId", client.getId().toString()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.rmas", hasSize(3)))
            .andExpect(jsonPath("$.rmas[0].code").value("RMA-END-2"))
            .andExpect(jsonPath("$.rmas[1].entryDate").value("2026-10-20"))
            .andExpect(jsonPath("$.rmas[2].entryDate").value("2026-10-01"))
            .andExpect(jsonPath("$.generatedAt").isNotEmpty());
    }

    @Test
    void returnsPersistedDiagnosisWarrantyPerItemAndShippingWithoutInventedOverrides() throws Exception {
        RmaRecord rma = saveRma("RMA-DETAIL", "2026-10-20", RmaStatus.RETURNED, client);
        rma.setPurchaseDateUnknown(false);
        rma.setPurchaseDate(LocalDate.parse("2025-10-20"));
        RmaItem covered = new RmaItem();
        covered.setProduct(product);
        covered.setWarrantyMonths(12);
        covered.getItemIdentification().setSerialNumber("SERIAL-A");
        RmaItem expired = new RmaItem();
        expired.setProduct(product);
        expired.setWarrantyMonths(6);
        expired.getItemIdentification().setSerialNumber("SERIAL-B");
        rma.replaceItems(List.of(covered, expired));
        Diagnosis diagnosis = new Diagnosis();
        diagnosis.setFoundFailure("Conector danificado");
        diagnosis.setDiagnosedAt(LocalDate.parse("2026-10-20"));
        diagnosis.setTechnicianName("Técnico responsável");
        rma.setDiagnosis(diagnosis);
        rma.setRepairSummary("Conector substituído");
        rma.setTestSummary("Teste funcional aprovado");
        rma.setShippedAt(LocalDate.parse("2026-10-21"));
        rma.setCarrier("Transportadora");
        rma.setTrackingCode("BR123");
        rmas.saveAndFlush(rma);

        mockMvc.perform(get("/api/reports/rmas").param("entryFrom", "2026-10-01").param("entryTo", "2026-10-31").with(user("tech").roles("TECHNICIAN")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.rmas[0].diagnosis.foundFailure").value("Conector danificado"))
            .andExpect(jsonPath("$.rmas[0].repairSummary").value("Conector substituído"))
            .andExpect(jsonPath("$.rmas[0].testSummary").value("Teste funcional aprovado"))
            .andExpect(jsonPath("$.rmas[0].items", hasSize(2)))
            .andExpect(jsonPath("$.rmas[0].items[0].warrantyStatus").value("IN_WARRANTY"))
            .andExpect(jsonPath("$.rmas[0].items[1].warrantyStatus").value("OUT_OF_WARRANTY"))
            .andExpect(jsonPath("$.rmas[0].warrantyOverridden").doesNotExist())
            .andExpect(jsonPath("$.rmas[0].shippedAt").value("2026-10-21"))
            .andExpect(jsonPath("$.rmas[0].trackingCode").value("BR123"))
            .andExpect(jsonPath("$.rmas[0].sla.status").value("CLOSED"));
    }

    @Test
    void measuresCurrentStageAtTheSingleReportInstantWithoutResettingOnNotes() throws Exception {
        RmaRecord rma = saveRma("RMA-AGING", "2026-10-20", RmaStatus.IN_DIAGNOSIS, client);
        Instant entry = Instant.parse("2026-10-20T23:30:00Z");
        addHistory(rma, RmaStatus.RECEIVED, entry.minusSeconds(3600));
        addHistory(rma, RmaStatus.IN_DIAGNOSIS, entry);
        addHistory(rma, RmaStatus.IN_DIAGNOSIS, entry.plusSeconds(1800));
        rmas.saveAndFlush(rma);
        var result = mockMvc.perform(get("/api/reports/rmas").param("entryFrom", "2026-10-01").param("entryTo", "2026-10-31").with(user("admin").roles("ADMIN")))
            .andExpect(status().isOk()).andReturn();
        var body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertEquals(Duration.between(entry, Instant.parse(body.get("generatedAt").asText())).getSeconds(),
            body.at("/rmas/0/sla/elapsedSeconds").asLong());
        assertEquals("2026-10-20T23:30:00Z", body.at("/rmas/0/sla/startedAt").asText());
    }

    @Test
    void supportsEmptyAndOneSidedFilters() throws Exception {
        saveRma("RMA-OLD", "2026-09-30", RmaStatus.RECEIVED, client);
        saveRma("RMA-NEW", "2026-10-01", RmaStatus.RECEIVED, client);
        mockMvc.perform(get("/api/reports/rmas").param("entryFrom", "2026-10-01").with(user("a").roles("ADMIN")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.rmas", hasSize(1)))
            .andExpect(jsonPath("$.rmas[0].code").value("RMA-NEW"));
        mockMvc.perform(get("/api/reports/rmas").param("entryTo", "2026-09-30").with(user("a").roles("ADMIN")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.rmas", hasSize(1)))
            .andExpect(jsonPath("$.rmas[0].code").value("RMA-OLD"));
        mockMvc.perform(get("/api/reports/rmas").param("clientId", "999999").with(user("a").roles("ADMIN")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.rmas", hasSize(0)));
    }

    @ParameterizedTest
    @CsvSource({"entryFrom,2026-02-30", "entryTo,not-a-date", "status,UNKNOWN", "clientId,0", "clientId,-1", "clientId,abc"})
    void rejectsMalformedFilters(String parameter, String value) throws Exception {
        mockMvc.perform(get("/api/reports/rmas").param(parameter, value).with(user("a").roles("ADMIN")))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.status").value(400));
    }

    @Test
    void appliesTheDefaultPeriodAndRejectsPeriodsLongerThanOneYear() throws Exception {
        LocalDate today = LocalDate.now(ZoneId.of("America/Sao_Paulo"));
        saveRma("RMA-RECENT", today.minusDays(10).toString(), RmaStatus.RECEIVED, client);
        saveRma("RMA-EDGE", today.minusDays(89).toString(), RmaStatus.RECEIVED, client);
        saveRma("RMA-OUTSIDE", today.minusDays(90).toString(), RmaStatus.RECEIVED, client);

        mockMvc.perform(get("/api/reports/rmas").with(user("a").roles("ADMIN")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entryFrom").value(today.minusDays(89).toString()))
            .andExpect(jsonPath("$.entryTo").value(today.toString()))
            .andExpect(jsonPath("$.rmas", hasSize(2)))
            .andExpect(jsonPath("$.rmas[0].code").value("RMA-RECENT"))
            .andExpect(jsonPath("$.rmas[1].code").value("RMA-EDGE"));

        mockMvc.perform(get("/api/reports/rmas").param("entryFrom", "2025-01-01").param("entryTo", "2026-01-02").with(user("a").roles("ADMIN")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Report period must be at most 366 days."));
        mockMvc.perform(get("/api/reports/rmas").param("entryFrom", "2025-01-01").param("entryTo", "2026-01-01").with(user("a").roles("ADMIN")))
            .andExpect(status().isOk());
    }

    @Test
    void loadsTheReportWithAConstantNumberOfQueries() throws Exception {
        long withOneRma = reportStatements(1);
        long withSixRmas = reportStatements(6);

        assertEquals(withOneRma, withSixRmas, "Report queries must not grow with the number of RMAs.");
    }

    private long reportStatements(int count) throws Exception {
        rmas.deleteAll();
        for (int index = 0; index < count; index++) {
            RmaRecord rma = saveRma("RMA-N1-" + count + "-" + index, "2026-10-1" + index % 10, RmaStatus.IN_DIAGNOSIS, client);
            RmaItem first = new RmaItem();
            first.setProduct(product);
            first.getItemIdentification().setSerialNumber("S-" + count + "-" + index + "-A");
            RmaItem second = new RmaItem();
            second.setProduct(product);
            second.getItemIdentification().setSerialNumber("S-" + count + "-" + index + "-B");
            rma.replaceItems(List.of(first, second));
            addHistory(rma, RmaStatus.RECEIVED, Instant.parse("2026-10-10T10:00:00Z"));
            addHistory(rma, RmaStatus.IN_DIAGNOSIS, Instant.parse("2026-10-10T11:00:00Z"));
            rmas.saveAndFlush(rma);
        }
        entityManager.flush();
        entityManager.clear();

        Statistics statistics = entityManager.getEntityManagerFactory().unwrap(SessionFactory.class).getStatistics();
        statistics.setStatisticsEnabled(true);
        statistics.clear();
        mockMvc.perform(get("/api/reports/rmas").param("entryFrom", "2026-10-01").param("entryTo", "2026-10-31").with(user("a").roles("ADMIN")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.rmas", hasSize(count)))
            .andExpect(jsonPath("$.rmas[0].items", hasSize(2)))
            .andExpect(jsonPath("$.rmas[0].statusHistory", hasSize(2)));
        long statements = statistics.getPrepareStatementCount();
        statistics.setStatisticsEnabled(false);
        return statements;
    }

    @Test
    void listsClientOptionsAsACompleteArrayForTheReportFilter() throws Exception {
        Client other = new Client();
        other.setLegalName("Alfa cliente");
        clients.save(other);

        mockMvc.perform(get("/api/clients/options").with(user("viewer").roles("VIEWER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(2)))
            .andExpect(jsonPath("$[0].legalName").value("Alfa cliente"))
            .andExpect(jsonPath("$[1].legalName").value("Cliente de relatórios"));
    }

    @Test
    void rejectsReversedPeriod() throws Exception {
        mockMvc.perform(get("/api/reports/rmas").param("entryFrom", "2026-10-21").param("entryTo", "2026-10-20")
                .with(user("a").roles("ADMIN")))
            .andExpect(status().isBadRequest());
    }

    @ParameterizedTest
    @ValueSource(strings = {"ADMIN", "TECHNICIAN", "VIEWER"})
    void permitsExistingReportRoles(String role) throws Exception {
        mockMvc.perform(get("/api/reports/rmas").with(user("reader").roles(role))).andExpect(status().isOk());
    }

    @Test
    void rejectsUnauthenticatedAndServiceDeskRequests() throws Exception {
        mockMvc.perform(get("/api/reports/rmas")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/reports/rmas").with(user("desk").roles("SERVICE_DESK")))
            .andExpect(status().isForbidden());
    }

    private RmaRecord saveRma(String code, String date, RmaStatus status, Client owner) {
        RmaRecord rma = new RmaRecord();
        rma.setCode(code);
        rma.setClient(owner);
        rma.setProduct(product);
        rma.setEntryDate(LocalDate.parse(date));
        rma.setPurchaseDateUnknown(true);
        rma.setReceivedBy("admin");
        rma.setReportedFailure("Não liga");
        rma.setStatus(status);
        return rmas.saveAndFlush(rma);
    }

    private void addHistory(RmaRecord rma, RmaStatus status, Instant changedAt) {
        RmaStatusHistory event = new RmaStatusHistory();
        event.setStatus(status);
        event.setChangedBy("admin");
        event.setChangedAt(changedAt);
        rma.addStatusHistory(event);
    }
}
