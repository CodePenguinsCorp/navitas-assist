package br.com.navitasassist.rma;

import static br.com.navitasassist.access.AccessTestSupport.asProfile;
import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.part.Part;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.PartRepository;
import br.com.navitasassist.repository.ProductRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class RmaRepairIntegrationTest {
    @Autowired private MockMvc mvc;
    @Autowired private org.springframework.jdbc.core.JdbcTemplate jdbc;
    @Autowired private ObjectMapper mapper;
    @Autowired private RmaRecordRepository rmas;
    @Autowired private ClientRepository clients;
    @Autowired private ProductRepository products;
    @Autowired private PartRepository parts;
    @jakarta.persistence.PersistenceContext private jakarta.persistence.EntityManager entityManager;
    private RmaRecord rma;

    @BeforeEach
    void setup() {
        Client client = new Client(); client.setLegalName("Cliente reparo"); clients.save(client);
        Product product = new Product(); product.setSku("REPAIR-TEST"); product.setName("Produto reparo"); products.save(product);
        rma = new RmaRecord(); rma.setCode("OS-REPAIR-TEST"); rma.setClient(client); rma.setProduct(product);
        rma.setEntryDate(LocalDate.now()); rma.setReceivedBy("Teste"); rma.setReportedFailure("Falha"); rma.setStatus(RmaStatus.IN_REPAIR); rmas.saveAndFlush(rma);
    }

    @Test
    void createsExternalComponentWithoutStockAndRejectsCatalogCode() throws Exception {
        Part part = new Part(); part.setCode("CATALOG"); part.setName("Catálogo"); part.setUnit("un"); part.setUnitCost(BigDecimal.ONE); part.setActive(false); parts.saveAndFlush(part);
        long count = parts.count();
        write("external-components", Map.of("description", "  Resistor  ", "quantity", "1.125", "replacementReason", " Curto ", "componentBatch", " A1 "))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.description").value("Resistor"))
            .andExpect(jsonPath("$.unit").value("un")).andExpect(jsonPath("$.appliedBy").value("repair-tech"))
            .andExpect(jsonPath("$.appliedAt").isNotEmpty()).andExpect(jsonPath("$.replacementReason").value("Curto"));
        assertEquals(count, parts.count());
        assertEquals(0, parts.findById(part.getId()).orElseThrow().getOnHand().signum());
        write("external-components", Map.of("code", " catalog ", "description", "X", "quantity", "1", "replacementReason", "Falha"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Código já cadastrado no estoque. Use a reserva de peças."));
        mvc.perform(get(base() + "/external-components").with(asProfile("viewer", "VIEWER")))
            .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].quantity").value(1.125));
    }

    @Test
    void recordsInterventionsAndSumsHours() throws Exception {
        write("interventions", intervention("1.125", LocalDate.now()))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.technicianName").value("repair-tech"))
            .andExpect(jsonPath("$.description").value("Limpeza da placa")).andExpect(jsonPath("$.hours").value(1.125));
        write("interventions", intervention("0.250", LocalDate.now().minusDays(1))).andExpect(status().isCreated());
        mvc.perform(get(base()).with(asProfile("viewer", "VIEWER"))).andExpect(status().isOk())
            .andExpect(jsonPath("$.interventions", hasSize(2))).andExpect(jsonPath("$.totalServiceHours").value(1.375));
    }

    @Test
    void rejectsInvalidRepairInputs() throws Exception {
        write("interventions", intervention("0", LocalDate.now())).andExpect(status().isBadRequest());
        write("interventions", intervention("1.0001", LocalDate.now())).andExpect(status().isBadRequest());
        write("interventions", intervention("1", LocalDate.now().plusDays(1))).andExpect(status().isBadRequest());
        write("interventions", Map.of("type", "INVALID", "description", "X", "performedOn", LocalDate.now().toString(), "hours", 1)).andExpect(status().isBadRequest());
        write("interventions", Map.of("type", "CLEANING", "description", " ", "performedOn", LocalDate.now().toString(), "hours", 1)).andExpect(status().isBadRequest());
        write("external-components", Map.of("description", "X", "quantity", "0", "replacementReason", "Falha")).andExpect(status().isBadRequest());
        write("external-components", Map.of("description", "X", "quantity", "1.0001", "replacementReason", "Falha")).andExpect(status().isBadRequest());
        write("external-components", Map.of("description", "X", "quantity", "1", "replacementReason", " ")).andExpect(status().isBadRequest());
        mvc.perform(get(base())).andExpect(status().isUnauthorized());
    }

    @Test
    void closedRmasAllowReadingButBlockNewRepairRecords() throws Exception {
        for (RmaStatus closed : new RmaStatus[]{RmaStatus.COMPLETED, RmaStatus.RETURNED, RmaStatus.IRREPARABLE}) {
            rma.setStatus(closed); rmas.saveAndFlush(rma);
            write("interventions", intervention("1", LocalDate.now())).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Não é permitido registrar reparos em uma OS encerrada."));
            write("external-components", Map.of("description", "X", "quantity", "1", "replacementReason", "Falha")).andExpect(status().isBadRequest());
            mvc.perform(get(base()).with(asProfile("viewer", "VIEWER"))).andExpect(status().isOk());
        }
    }

    @Test
    void missingRmaReturnsNotFoundForReadsAndWrites() throws Exception {
        mvc.perform(get("/api/rmas/999999/repair").with(asProfile("viewer", "VIEWER"))).andExpect(status().isNotFound());
        mvc.perform(post("/api/rmas/999999/repair/interventions").with(asProfile("repair-tech", "TECHNICIAN")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(intervention("1", LocalDate.now())))).andExpect(status().isNotFound());
    }

    @Test
    void editsAndVoidsInterventionWithoutDeletingOrCountingHours() throws Exception {
        var created = write("interventions", intervention("1", LocalDate.now())).andExpect(status().isCreated()).andReturn();
        long id = mapper.readTree(created.getResponse().getContentAsString()).get("id").asLong();
        mvc.perform(put(base() + "/interventions/" + id).with(asProfile("editor", "TECHNICIAN")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(intervention("2.5", LocalDate.now()))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.hours").value(2.5)).andExpect(jsonPath("$.editedBy").value("editor"));
        write("interventions/" + id + "/void", Map.of("reason", "  Duplicado  ")).andExpect(status().isOk())
            .andExpect(jsonPath("$.voidReason").value("Duplicado")).andExpect(jsonPath("$.voidedAt").isNotEmpty());
        entityManager.flush();
        entityManager.clear();
        mvc.perform(get(base()).with(asProfile("viewer", "VIEWER"))).andExpect(status().isOk())
            .andExpect(jsonPath("$.totalServiceHours").value(0)).andExpect(jsonPath("$.interventions", hasSize(1)));
        write("interventions/" + id + "/void", Map.of("reason", "De novo")).andExpect(status().isBadRequest());
        assertEquals(1, jdbc.queryForObject("select count(*) from audit_events where action = 'REPAIR_VOID' and entity_type = 'INTERVENTION' and entity_id = ?", Integer.class, id));
        mvc.perform(get("/api/rmas/" + rma.getId()).with(asProfile("viewer", "VIEWER"))).andExpect(status().isOk())
            .andExpect(jsonPath("$.repairHistory", hasSize(3))).andExpect(jsonPath("$.repairHistory[0].changedBy").isNotEmpty())
            .andExpect(jsonPath("$.repairHistory[0].id").isNumber()).andExpect(jsonPath("$.repairHistory[0].action").value("VOID"));
    }

    @Test
    void externalEditsValidateAndVoidRequiresReasonAndOpenRma() throws Exception {
        var payload = Map.of("description", "Capacitor", "quantity", "1", "replacementReason", "Falha");
        var created = write("external-components", payload).andExpect(status().isCreated()).andReturn();
        long id = mapper.readTree(created.getResponse().getContentAsString()).get("id").asLong();
        String path = base() + "/external-components/" + id;
        mvc.perform(put(path).with(asProfile("editor", "TECHNICIAN")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(payload)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.editedAt").isNotEmpty());
        mvc.perform(put(base() + "/external-components/999999").with(asProfile("editor", "TECHNICIAN")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(payload)))
            .andExpect(status().isNotFound());
        write("external-components/" + id + "/void", Map.of("reason", " ")).andExpect(status().isBadRequest());
        write("external-components/" + id + "/void", Map.of("reason", "x".repeat(1001))).andExpect(status().isBadRequest());
        rma.setStatus(RmaStatus.COMPLETED); rmas.saveAndFlush(rma);
        mvc.perform(put(path).with(asProfile("editor", "TECHNICIAN")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(payload)))
            .andExpect(status().isBadRequest());
        write("external-components/" + id + "/void", Map.of("reason", "Erro")).andExpect(status().isBadRequest());
        rma.setStatus(RmaStatus.IN_REPAIR); rmas.saveAndFlush(rma);
        write("external-components/" + id + "/void", Map.of("reason", "Erro")).andExpect(status().isOk());
        assertEquals(1, jdbc.queryForObject("select count(*) from audit_events where action = 'REPAIR_VOID' and entity_type = 'EXTERNAL_COMPONENT' and entity_id = ?", Integer.class, id));
    }

    @Test
    void keepsTheCompleteVoidReasonInTheTimelineWithMaximumLengthDescription() throws Exception {
        var payload = new java.util.HashMap<>(intervention("1", LocalDate.now()));
        payload.put("description", "D".repeat(1000));
        var created = write("interventions", payload).andExpect(status().isCreated()).andReturn();
        long id = mapper.readTree(created.getResponse().getContentAsString()).get("id").asLong();
        String reason = "Motivo " + "R".repeat(993);
        write("interventions/" + id + "/void", Map.of("reason", reason)).andExpect(status().isOk());
        entityManager.flush();
        entityManager.clear();
        mvc.perform(get("/api/rmas/" + rma.getId()).with(asProfile("viewer", "VIEWER"))).andExpect(status().isOk())
            .andExpect(jsonPath("$.repairHistory[0].summary").value(org.hamcrest.Matchers.containsString(reason)));
    }

    private Map<String, Object> intervention(String hours, LocalDate date) {
        return Map.of("type", "CLEANING", "description", " Limpeza da placa ", "performedOn", date.toString(), "hours", hours);
    }
    private String base() { return "/api/rmas/" + rma.getId() + "/repair"; }
    private org.springframework.test.web.servlet.ResultActions write(String path, Object payload) throws Exception {
        return mvc.perform(post(base() + "/" + path).with(asProfile("repair-tech", "TECHNICIAN")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(payload)));
    }
}
