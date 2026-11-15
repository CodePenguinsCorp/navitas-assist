package br.com.navitasassist.rma;

import static br.com.navitasassist.access.AccessTestSupport.asProfile;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.part.Part;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.PartRepository;
import br.com.navitasassist.repository.ProductRepository;
import br.com.navitasassist.repository.RmaBlockRepository;
import br.com.navitasassist.repository.RmaExternalComponentRepository;
import br.com.navitasassist.repository.RmaInterventionRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/** Sugestões dos campos de texto livre: valores já usados, sem repetir por caixa ou acento, em ordem alfabética. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class SuggestionIntegrationTest {
    @Autowired private MockMvc mvc;
    @Autowired private RmaRecordRepository rmas;
    @Autowired private ClientRepository clients;
    @Autowired private ProductRepository products;
    @Autowired private PartRepository parts;
    @Autowired private RmaInterventionRepository interventions;
    @Autowired private RmaBlockRepository blocks;
    @Autowired private RmaExternalComponentRepository externalComponents;
    private RmaRecord rma;

    @BeforeEach
    void setup() {
        Client client = new Client(); client.setLegalName("Cliente sugestões"); clients.save(client);
        Product product = new Product(); product.setSku("SUGGEST-TEST"); product.setName("Produto sugestões"); products.save(product);
        rma = new RmaRecord(); rma.setCode("OS-SUGGEST-TEST"); rma.setClient(client); rma.setProduct(product);
        rma.setEntryDate(LocalDate.now()); rma.setReceivedBy("Teste"); rma.setReportedFailure("Falha"); rma.setStatus(RmaStatus.IN_REPAIR); rmas.saveAndFlush(rma);
    }

    @Test
    void suggestsInterventionTypesWithoutDuplicatesByCaseOrAccent() throws Exception {
        intervention("Regravação"); intervention("regravacao"); intervention("  Troca de conector USB "); intervention("Limpeza ultrassônica");
        mvc.perform(get("/api/suggestions/intervention-types").with(asProfile("viewer", "VIEWER"))).andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(3)))
            .andExpect(jsonPath("$[0]").value("Limpeza ultrassônica")).andExpect(jsonPath("$[1]").value("Regravação")).andExpect(jsonPath("$[2]").value("Troca de conector USB"));
    }

    @Test
    void suggestsBlockCategoriesAndIgnoresEmptyOnes() throws Exception {
        block("Aguardando cliente"); block("aguardando CLIENTE"); block(null); block("  "); block("Peça em falta");
        mvc.perform(get("/api/suggestions/block-categories").with(asProfile("viewer", "VIEWER"))).andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(2))).andExpect(jsonPath("$[0]").value("Aguardando cliente")).andExpect(jsonPath("$[1]").value("Peça em falta"));
    }

    @Test
    void suggestsUnitsFromPartsAndExternalComponentsTogether() throws Exception {
        part("SUG-1", "Rolo", "ROLO-X", "Gaveta 7"); part("SUG-2", "Rolo", "rolo-x", "gaveta 7");
        RmaExternalComponent component = new RmaExternalComponent();
        component.setRma(rma); component.setDescription("Cabo"); component.setQuantity(BigDecimal.ONE); component.setUnit("Lance");
        component.setReplacementReason("Falha"); component.setAppliedAt(Instant.now()); component.setAppliedBy("tech"); externalComponents.saveAndFlush(component);
        mvc.perform(get("/api/suggestions/part-units").with(asProfile("viewer", "VIEWER"))).andExpect(status().isOk())
            .andExpect(jsonPath("$", hasItem("Lance"))).andExpect(jsonPath("$", hasItem("ROLO-X"))).andExpect(jsonPath("$", not(hasItem("rolo-x"))));
        mvc.perform(get("/api/suggestions/part-locations").with(asProfile("viewer", "VIEWER"))).andExpect(status().isOk())
            .andExpect(jsonPath("$", hasItem("Gaveta 7"))).andExpect(jsonPath("$", not(hasItem("gaveta 7"))));
    }

    @Test
    void requiresAuthenticationAndTheMatchingPermission() throws Exception {
        for (String path : new String[] {"intervention-types", "block-categories", "part-units", "part-locations"}) {
            mvc.perform(get("/api/suggestions/" + path)).andExpect(status().isUnauthorized());
            mvc.perform(get("/api/suggestions/" + path).with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user("sem-permissao")))
                .andExpect(status().isForbidden());
        }
        mvc.perform(get("/api/suggestions/outro-campo").with(asProfile("viewer", "VIEWER"))).andExpect(status().is4xxClientError());
    }

    private void intervention(String type) {
        RmaIntervention item = new RmaIntervention(); item.setRma(rma); item.setType(type); item.setDescription("Reparo");
        item.setPerformedOn(LocalDate.now()); item.setTechnicianName("tech"); interventions.saveAndFlush(item);
    }

    private void block(String category) {
        RmaBlock item = new RmaBlock(); item.setRma(rma); item.setReason("Motivo"); item.setCategory(category);
        item.setBlockedBy("tech"); item.setBlockedAt(Instant.now()); blocks.saveAndFlush(item);
    }

    private void part(String code, String name, String unit, String location) {
        Part part = new Part(); part.setCode(code); part.setName(name); part.setUnit(unit); part.setLocation(location);
        part.setUnitCost(BigDecimal.ONE); parts.saveAndFlush(part);
    }
}
