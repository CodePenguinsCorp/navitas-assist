package br.com.navitasassist.rma;

import static br.com.navitasassist.access.AccessTestSupport.asProfile;
import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
class RmaStatusNoteIntegrationTest {
    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private RmaRecordRepository rmas;
    @Autowired private ClientRepository clients;
    @Autowired private ProductRepository products;
    @Autowired private PartRepository parts;
    @Autowired private org.springframework.jdbc.core.JdbcTemplate jdbc;
    private RmaRecord rma;

    @BeforeEach
    void setup() {
        Client client = new Client(); client.setLegalName("Cliente reparo"); clients.save(client);
        Product product = new Product(); product.setSku("REPAIR-TEST"); product.setName("Produto reparo"); products.save(product);
        rma = new RmaRecord(); rma.setCode("OS-REPAIR-TEST"); rma.setClient(client); rma.setProduct(product);
        rma.setEntryDate(LocalDate.now()); rma.setReceivedBy("Teste"); rma.setReportedFailure("Falha"); rma.setStatus(RmaStatus.IN_REPAIR); rmas.saveAndFlush(rma);
    }

    @Test
    void editsOnlyNoteAndPersistsAudit() throws Exception {
        RmaStatusHistory event = new RmaStatusHistory(); event.setStatus(rma.getStatus()); event.setChangedBy("original");
        event.setChangedAt(java.time.Instant.parse("2026-01-01T10:00:00Z")); event.setNote("Avenida Teste 321; old@example.invalid; senha=OldSecret"); rma.addStatusHistory(event); rma = rmas.saveAndFlush(rma); event = rma.getStatusHistory().get(0);
        String path = "/api/rmas/" + rma.getId() + "/status-history/" + event.getId() + "/note";
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(path).with(asProfile("editor", "SERVICE_DESK")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content("{\"note\":\"  Rua Teste 123; new@example.invalid; senha=NewSecret  \"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.statusHistory[0].id").value(event.getId()))
            .andExpect(jsonPath("$.statusHistory[0].note").value("Rua Teste 123; new@example.invalid; senha=NewSecret"))
            .andExpect(jsonPath("$.statusHistory[0].changedBy").value("original"))
            .andExpect(jsonPath("$.statusHistory[0].changedAt").value("2026-01-01T10:00:00Z"))
            .andExpect(jsonPath("$.statusHistory[0].noteEditedBy").value("editor"))
            .andExpect(jsonPath("$.statusHistory[0].noteEditedAt").isNotEmpty());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(path).with(asProfile("editor", "SERVICE_DESK")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content("{\"note\":\"   \"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.statusHistory[0].note").isEmpty());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(path).with(asProfile("editor", "SERVICE_DESK")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(Map.of("note", "x".repeat(256)))))
            .andExpect(status().isBadRequest());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(path.replace("/status-history/" + event.getId(), "/status-history/999999")).with(asProfile("editor", "SERVICE_DESK")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content("{\"note\":\"X\"}"))
            .andExpect(status().isNotFound());
        assertEquals(2, jdbc.queryForObject("select count(*) from audit_events where entity_type = 'RMA_STATUS_NOTE' and entity_id = ?", Integer.class, event.getId()));
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForList("select summary from audit_events where entity_type = 'RMA_STATUS_NOTE' and entity_id = ? order by id", String.class, event.getId()).get(0))
            .contains("Observação anterior:", "; nova:", "[endereço omitido]", "[e-mail omitido]", "senha [omitido]")
            .doesNotContain("Avenida Teste", "old@example.invalid", "OldSecret", "Rua Teste", "new@example.invalid", "NewSecret");
        rma.setStatus(RmaStatus.COMPLETED); rmas.saveAndFlush(rma);
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(path).with(asProfile("editor", "SERVICE_DESK")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content("{\"note\":\"X\"}"))
            .andExpect(status().isBadRequest());
    }
    @Test
    void auditKeepsThePreviousNoteLimitedToTwoHundredCharactersAndTheNewNote() throws Exception {
        RmaStatusHistory event = new RmaStatusHistory();
        event.setStatus(rma.getStatus()); event.setChangedBy("original");
        event.setChangedAt(java.time.Instant.now()); event.setNote("x".repeat(220));
        rma.addStatusHistory(event); rma = rmas.saveAndFlush(rma);
        Long eventId = rma.getStatusHistory().get(0).getId();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(
                "/api/rmas/" + rma.getId() + "/status-history/" + eventId + "/note")
            .with(asProfile("editor", "SERVICE_DESK")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(Map.of("note", "y".repeat(255)))))
            .andExpect(status().isOk());
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject(
            "select summary from audit_events where entity_type = 'RMA_STATUS_NOTE' and entity_id = ?", String.class, eventId))
            .contains("Observação anterior: " + "x".repeat(200) + "; nova: " + "y".repeat(255))
            .doesNotContain("x".repeat(201));
    }

    @Test
    void rejectsEventBelongingToAnotherRma() throws Exception {
        RmaRecord other = new RmaRecord(); other.setCode("OS-NOTE-OTHER"); other.setClient(rma.getClient()); other.setProduct(rma.getProduct());
        other.setEntryDate(LocalDate.now()); other.setReceivedBy("original"); other.setReportedFailure("Falha"); other.setStatus(RmaStatus.IN_REPAIR);
        RmaStatusHistory event = new RmaStatusHistory(); event.setStatus(other.getStatus()); event.setChangedBy("original"); event.setChangedAt(java.time.Instant.now());
        event.setNote("Intacta"); other.addStatusHistory(event); other = rmas.saveAndFlush(other); Long eventId = other.getStatusHistory().get(0).getId();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch("/api/rmas/" + rma.getId() + "/status-history/" + eventId + "/note")
            .with(asProfile("editor", "SERVICE_DESK")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"note\":\"Alterada\"}"))
            .andExpect(status().isNotFound());
        assertEquals("Intacta", jdbc.queryForObject("select note from rma_status_history where id = ?", String.class, eventId));
    }

    @Test
    void statusChangeReturnsTheCreatedEventIdReadyForNoteEditing() throws Exception {
        var result = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch("/api/rmas/" + rma.getId() + "/status")
            .with(asProfile("editor", "SERVICE_DESK")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"TRIAGE\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.statusHistory[0].id").isNumber()).andReturn();
        long eventId = mapper.readTree(result.getResponse().getContentAsString()).get("statusHistory").get(0).get("id").asLong();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch("/api/rmas/" + rma.getId() + "/status-history/" + eventId + "/note")
            .with(asProfile("editor", "SERVICE_DESK")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"note\":\"Depois da mudanca\"}"))
            .andExpect(status().isOk());
        assertEquals("Depois da mudanca", jdbc.queryForObject("select note from rma_status_history where id = ?", String.class, eventId));
        assertEquals("editor", jdbc.queryForObject("select note_edited_by from rma_status_history where id = ?", String.class, eventId));
    }

}
