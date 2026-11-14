package br.com.navitasassist.rma;

import static br.com.navitasassist.access.AccessTestSupport.asProfile;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.UUID;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.access.AccessTestSupport;
import br.com.navitasassist.repository.AccessProfileRepository;
import br.com.navitasassist.user.UserAccount;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.context.transaction.TestTransaction;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class RmaWarrantyIntegrationTest {
    @Autowired private MockMvc mvc;
    @Autowired private EntityManager em;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ObjectMapper mapper;
    @Autowired private AccessProfileRepository profiles;

    @Test
    void overridesAndRemovesWarrantyWithPersistentAudit() throws Exception {
        RmaRecord rma = saveRma();
        Long itemId = rma.getItems().get(0).getId();
        String path = path(rma, itemId);
        mvc.perform(put(path).with(asProfile("desk", "SERVICE_DESK")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"override\":\"IN_WARRANTY\",\"reason\":\"  Cortesia  \"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items[0].warrantyStatus").value("IN_WARRANTY"))
            .andExpect(jsonPath("$.items[0].calculatedWarrantyStatus").value("OUT_OF_WARRANTY"))
            .andExpect(jsonPath("$.items[0].warrantyOverride.status").value("IN_WARRANTY"))
            .andExpect(jsonPath("$.items[0].warrantyOverride.reason").value("Cortesia"))
            .andExpect(jsonPath("$.items[0].warrantyOverride.changedBy").value("desk"))
            .andExpect(jsonPath("$.items[0].warrantyOverride.changedAt").isNotEmpty())
            .andExpect(jsonPath("$.warrantyHistory[0].itemId").value(itemId))
            .andExpect(jsonPath("$.warrantyHistory[0].previousOverride").isEmpty())
            .andExpect(jsonPath("$.warrantyHistory[0].newOverride").value("IN_WARRANTY"));
        em.flush();
        em.clear();
        assertThat(jdbc.queryForObject("select warranty_override from rma_items where id = ?", String.class, itemId)).isEqualTo("IN_WARRANTY");
        mvc.perform(put(path).with(asProfile("desk", "SERVICE_DESK")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"override\":null}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items[0].warrantyStatus").value("OUT_OF_WARRANTY"))
            .andExpect(jsonPath("$.items[0].warrantyOverride").isEmpty())
            .andExpect(jsonPath("$.warrantyHistory", hasSize(2)))
            .andExpect(jsonPath("$.warrantyHistory[0].previousOverride").value("IN_WARRANTY"))
            .andExpect(jsonPath("$.warrantyHistory[0].newOverride").isEmpty())
            .andExpect(jsonPath("$.warrantyHistory[0].changedBy").value("desk"));
        em.flush();
        em.clear();
        mvc.perform(get("/api/rmas/{id}", rma.getId()).with(asProfile("reader", "VIEWER")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.warrantyHistory", hasSize(2)));
        assertThat(jdbc.queryForObject("select count(*) from rma_item_warranty_history where rma_item_id = ?", Integer.class, itemId)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select warranty_override from rma_items where id = ?", String.class, itemId)).isNull();
        assertThat(jdbc.queryForObject("select count(*) from audit_events where entity_type = 'RMA_ITEM' and entity_id = ?", Integer.class, itemId)).isEqualTo(2);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "   ", "LONG"})
    void rejectsInvalidReason(String reason) throws Exception {
        RmaRecord rma = saveRma();
        if (reason.equals("LONG")) reason = "x".repeat(256);
        mvc.perform(put(path(rma, rma.getItems().get(0).getId())).with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(java.util.Map.of("override", "IN_WARRANTY", "reason", reason))))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Informe um motivo de até 255 caracteres para ajustar a garantia."));
    }

    @ParameterizedTest
    @ValueSource(strings = {"PENDING", "INVALID"})
    void rejectsUnsupportedOverride(String override) throws Exception {
        RmaRecord rma = saveRma();
        mvc.perform(put(path(rma, rma.getItems().get(0).getId())).with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"override\":\"" + override + "\",\"reason\":\"Motivo\"}"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Garantia manual deve ser IN_WARRANTY ou OUT_OF_WARRANTY."));
    }

    @Test
    void rejectsItemFromAnotherRma() throws Exception {
        RmaRecord first = saveRma();
        RmaRecord other = saveRma();
        mvc.perform(put(path(first, other.getItems().get(0).getId())).with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"override\":null}"))
            .andExpect(status().isNotFound());
    }

    @ParameterizedTest
    @ValueSource(strings = {"COMPLETED", "RETURNED", "IRREPARABLE"})
    void rejectsClosedRma(String closedStatus) throws Exception {
        RmaRecord rma = saveRma();
        rma.setStatus(RmaStatus.valueOf(closedStatus));
        em.flush();
        mvc.perform(put(path(rma, rma.getItems().get(0).getId())).with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"override\":\"IN_WARRANTY\",\"reason\":\"Cortesia\"}"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Não é possível ajustar a garantia de uma OS encerrada."));
    }

    private String path(RmaRecord rma, Long itemId) {
        return "/api/rmas/" + rma.getId() + "/items/" + itemId + "/warranty";
    }

    @Test
    void returnsEffectiveWarrantyForBoardListAndReportConsumers() throws Exception {
        RmaRecord rma = saveRma();
        mvc.perform(put(path(rma, rma.getItems().get(0).getId())).with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"override\":\"IN_WARRANTY\",\"reason\":\"Cortesia\"}"))
            .andExpect(status().isOk());
        em.flush();
        em.clear();
        mvc.perform(get("/api/rmas/board").param("query", rma.getCode()).with(asProfile("reader", "VIEWER")))
            .andExpect(status().isOk()).andExpect(jsonPath("$[0].items[0].warrantyStatus").value("IN_WARRANTY"));
        mvc.perform(get("/api/rmas").param("query", rma.getCode()).with(asProfile("reader", "VIEWER")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.content[0].items[0].warrantyStatus").value("IN_WARRANTY"));
        mvc.perform(get("/api/reports/rmas").param("entryFrom", "2026-01-01").param("entryTo", "2026-01-01")
                .param("clientId", rma.getClient().getId().toString()).with(asProfile("reader", "VIEWER")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.rmas.content[0].warrantyStatuses[0]").value("IN_WARRANTY"));
        mvc.perform(get("/api/reports/rmas/summary").param("entryFrom", "2026-01-01").param("entryTo", "2026-01-01")
                .param("clientId", rma.getClient().getId().toString()).with(asProfile("reader", "VIEWER")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.byWarranty[0].key").value("IN_WARRANTY"))
            .andExpect(jsonPath("$.byWarranty[0].count").value(1));
    }

    @Test
    void savedViewWarrantySelectsTheEffectiveStatusFromTheBoard() throws Exception {
        String username = "warranty-view-" + UUID.randomUUID().toString().substring(0, 8);
        UserAccount owner = new UserAccount();
        owner.setUsername(username);
        owner.setFullName("Visão de garantia");
        owner.setPasswordHash("unused");
        owner.setActive(true);
        AccessTestSupport.assignProfile(profiles, owner, "ADMIN");
        em.persist(owner);
        RmaRecord rma = saveRma();
        mvc.perform(post("/api/kanban-views").with(asProfile(username, "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Em garantia\",\"defaultView\":false,\"filters\":{\"warranty\":\"IN_WARRANTY\"}}"))
            .andExpect(status().isCreated());
        mvc.perform(put(path(rma, rma.getItems().get(0).getId())).with(asProfile(username, "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"override\":\"IN_WARRANTY\",\"reason\":\"Cortesia\"}"))
            .andExpect(status().isOk());
        em.flush();
        em.clear();
        var views = mvc.perform(get("/api/kanban-views").with(asProfile(username, "ADMIN"))).andExpect(status().isOk()).andReturn();
        String warrantyFilter = mapper.readTree(views.getResponse().getContentAsString()).get(0).path("filters").path("warranty").asText();
        assertThat(warrantyFilter).isEqualTo("IN_WARRANTY");
        var board = mvc.perform(get("/api/rmas/board").param("query", rma.getCode()).with(asProfile(username, "ADMIN")))
            .andExpect(status().isOk()).andReturn();
        var row = mapper.readTree(board.getResponse().getContentAsString()).get(0);
        // The Kanban applies the saved filter to items[].warrantyStatus from this response.
        assertThat(row.path("items").findValuesAsText("warrantyStatus")).contains(warrantyFilter);
        assertThat(row.path("items").findValuesAsText("calculatedWarrantyStatus")).containsExactly("OUT_OF_WARRANTY");
    }

    @Test
    void rollsBackOverrideAndHistoryTogether() throws Exception {
        RmaRecord rma = saveRma();
        Long itemId = rma.getItems().get(0).getId();
        Long rmaId = rma.getId();
        Long clientId = rma.getClient().getId();
        Long productId = rma.getProduct().getId();
        TestTransaction.flagForCommit();
        TestTransaction.end();
        try {
            TestTransaction.start();
            mvc.perform(put(path(rma, itemId)).with(asProfile("admin", "ADMIN")).with(csrf())
                    .contentType(MediaType.APPLICATION_JSON).content("{\"override\":\"IN_WARRANTY\",\"reason\":\"Cortesia\"}"))
                .andExpect(status().isOk());
            em.flush();
            TestTransaction.flagForRollback();
            TestTransaction.end();
            assertThat(jdbc.queryForObject("select warranty_override from rma_items where id = ?", String.class, itemId)).isNull();
            assertThat(jdbc.queryForObject("select count(*) from audit_events where entity_type = 'RMA_ITEM' and entity_id = ?", Integer.class, itemId)).isZero();
            assertThat(jdbc.queryForObject("select count(*) from rma_item_warranty_history where rma_item_id = ?", Integer.class, itemId)).isZero();
        } finally {
            if (TestTransaction.isActive()) {
                TestTransaction.flagForRollback();
                TestTransaction.end();
            }
            TestTransaction.start();
            em.remove(em.find(RmaRecord.class, rmaId));
            em.flush();
            em.remove(em.find(Client.class, clientId));
            em.remove(em.find(Product.class, productId));
            TestTransaction.flagForCommit();
            TestTransaction.end();
        }
    }

    @Test
    void keepsOverrideAndHistoryWhenGeneralEditResubmitsTheSameItem() throws Exception {
        RmaRecord rma = saveRma();
        Long itemId = rma.getItems().get(0).getId();
        mvc.perform(put(path(rma, itemId)).with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"override\":\"IN_WARRANTY\",\"reason\":\"Cortesia\"}"))
            .andExpect(status().isOk());
        mvc.perform(put("/api/rmas/{id}", rma.getId()).with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"items\":[{\"productId\":" + rma.getProduct().getId() + ",\"serialNumber\":\"SERIAL\"}]}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(itemId))
            .andExpect(jsonPath("$.items[0].warrantyStatus").value("IN_WARRANTY"))
            .andExpect(jsonPath("$.warrantyHistory", hasSize(1)));
        em.flush();
    }

    @Test
    void protectsAuditWhenGeneralEditRemovesAnAuditedItem() throws Exception {
        RmaRecord rma = saveRma();
        mvc.perform(put(path(rma, rma.getItems().get(0).getId())).with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"override\":\"IN_WARRANTY\",\"reason\":\"Cortesia\"}"))
            .andExpect(status().isOk());
        mvc.perform(put("/api/rmas/{id}", rma.getId()).with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"items\":[{\"productId\":" + rma.getProduct().getId() + ",\"serialNumber\":\"OUTRO\"}]}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Não é possível remover um item com histórico de ajuste de garantia."));
    }

    @Test
    void generalEditKeepsTheRequestOrderAndItsFirstItemAsPrimary() throws Exception {
        RmaRecord rma = saveRma();
        RmaItem second = new RmaItem();
        second.setProduct(rma.getProduct());
        second.getItemIdentification().setSerialNumber("SECOND");
        rma.addItem(second);
        em.flush();
        Long secondId = second.getId();
        Long product = rma.getProduct().getId();
        mvc.perform(put("/api/rmas/{id}", rma.getId()).with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"items\":[{\"productId\":" + product
                    + ",\"serialNumber\":\"NEW\"},{\"productId\":" + product + ",\"serialNumber\":\"SECOND\"},{\"productId\":" + product
                    + ",\"serialNumber\":\"SERIAL\"}]}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items[0].serialNumber").value("NEW"))
            .andExpect(jsonPath("$.items[1].serialNumber").value("SECOND"))
            .andExpect(jsonPath("$.items[1].id").value(secondId))
            .andExpect(jsonPath("$.items[2].serialNumber").value("SERIAL"))
            .andExpect(jsonPath("$.serialNumber").value("NEW"));
        em.flush();
        em.clear();
        mvc.perform(get("/api/rmas/{id}", rma.getId()).with(asProfile("reader", "VIEWER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items[0].serialNumber").value("NEW"))
            .andExpect(jsonPath("$.items[1].serialNumber").value("SECOND"))
            .andExpect(jsonPath("$.items[2].serialNumber").value("SERIAL"))
            .andExpect(jsonPath("$.serialNumber").value("NEW"));
        assertThat(jdbc.queryForObject("select serial_number from rmas where id = ?", String.class, rma.getId())).isEqualTo("NEW");
    }

    private RmaRecord saveRma() {
        Client client = new Client();
        client.setLegalName("Garantia manual");
        em.persist(client);
        Product product = new Product();
        product.setSku(UUID.randomUUID().toString());
        product.setName("Produto");
        product.setDefaultWarrantyMonths(12);
        em.persist(product);
        RmaRecord rma = new RmaRecord();
        rma.setCode(UUID.randomUUID().toString().substring(0, 20));
        rma.setClient(client);
        rma.setProduct(product);
        rma.setPurchaseDate(LocalDate.of(2024, 1, 1));
        rma.setEntryDate(LocalDate.of(2026, 1, 1));
        rma.setReceivedBy("desk");
        rma.setReportedFailure("Falha");
        RmaItem item = new RmaItem();
        item.setProduct(product);
        item.setWarrantyMonths(12);
        item.getItemIdentification().setSerialNumber("SERIAL");
        rma.addItem(item);
        em.persist(rma);
        em.flush();
        return rma;
    }
}
