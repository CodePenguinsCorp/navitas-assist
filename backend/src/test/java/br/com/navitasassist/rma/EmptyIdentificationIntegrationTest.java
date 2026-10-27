package br.com.navitasassist.rma;

import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.ProductRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
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

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class EmptyIdentificationIntegrationTest {
    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private RmaRecordRepository rmas;
    @Autowired private ClientRepository clients;
    @Autowired private ProductRepository products;
    @Autowired private JdbcTemplate jdbc;
    private final List<Long> createdIds = new ArrayList<>();
    private Client client;
    private Product product;

    @BeforeEach
    void prepare() {
        client = new Client();
        client.setLegalName("NAV69 client");
        client = clients.saveAndFlush(client);
        product = new Product();
        product.setSku("NAV69-" + UUID.randomUUID().toString().substring(0, 8));
        product.setName("NAV69 product");
        product.setDefaultWarrantyMonths(12);
        product = products.saveAndFlush(product);
    }

    @AfterEach
    void cleanup() {
        createdIds.forEach(rmas::deleteById);
        products.deleteById(product.getId());
        clients.deleteById(client.getId());
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void emptyIdentificationSurvivesReloadAndReadsDoNotWrite(boolean withItem) throws Exception {
        RmaRecord saved = fixture(withItem);
        Map<String, Object> before = row("rmas", saved.getId());
        assertNull(before.get("batch_number"));
        assertNull(before.get("serial_number"));
        assertNull(before.get("manufactured_at"));
        var updatedAt = jdbc.queryForObject("select updated_at from rmas where id = ?", Object.class, saved.getId());
        for (String path : List.of("/api/rmas/" + saved.getId(), "/api/rmas/code/" + saved.getCode())) {
            mvc.perform(get(path).with(user("viewer").roles("VIEWER")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.batchNumber").value(nullValue()))
                .andExpect(jsonPath("$.serialNumber").value(nullValue())).andExpect(jsonPath("$.manufacturedAt").value(nullValue()))
                .andExpect(jsonPath("$.items[0].serialNumber").value(nullValue()))
                .andExpect(jsonPath("$.items[0].productId").value(product.getId()))
                .andExpect(jsonPath("$.items[0].warrantyMonths").value(withItem ? 6 : 12))
                .andExpect(jsonPath("$.items[0].warrantyStatus").value("PENDING"));
        }
        mvc.perform(get("/api/rmas").param("query", saved.getCode()).with(user("viewer").roles("VIEWER")))
            .andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(saved.getId()));
        assertEquals(before, row("rmas", saved.getId()));
        assertEquals(updatedAt, jdbc.queryForObject("select updated_at from rmas where id = ?", Object.class, saved.getId()));
        if (withItem) assertEquals(before, row("rma_items", saved.getItems().get(0).getId()));
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void invalidEditIsBusinessErrorAndIdentifiedItemsCanRepairRecord(boolean withItem) throws Exception {
        RmaRecord saved = fixture(withItem);
        mvc.perform(put("/api/rmas/{id}", saved.getId()).with(user("admin").roles("ADMIN")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content("{\"priority\":\"HIGH\"}"))
            .andExpect(status().isBadRequest());
        assertEquals(RmaPriority.MEDIUM, rmas.findById(saved.getId()).orElseThrow().getPriority());
        mvc.perform(put("/api/rmas/{id}", saved.getId()).with(user("admin").roles("ADMIN")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(Map.of("items", identifiedItems()))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.serialNumber").value("NAV69-SERIAL"));
        mvc.perform(get("/api/rmas/{id}", saved.getId()).with(user("viewer").roles("VIEWER")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].serialNumber").value("NAV69-SERIAL"));
        assertEquals("NAV69-SERIAL", row("rmas", saved.getId()).get("serial_number"));
    }

    @Test
    void creationStillRequiresIdentificationAndPreservesProvidedData() throws Exception {
        var payload = new java.util.LinkedHashMap<String, Object>(Map.of("clientId", client.getId(),
            "purchaseDateUnknown", true,
            "entryDate", LocalDate.now(ZoneId.of("America/Sao_Paulo")).toString(), "reportedFailure", "Failure",
            "items", List.of(Map.of("productId", product.getId()))));
        mvc.perform(post("/api/rmas").with(user("admin").roles("ADMIN")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(payload))).andExpect(status().isBadRequest());
        payload.put("items", identifiedItems());
        var response = mvc.perform(post("/api/rmas").with(user("admin").roles("ADMIN")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(payload)))
            .andExpect(status().isCreated()).andReturn();
        long id = mapper.readTree(response.getResponse().getContentAsString()).get("id").asLong();
        createdIds.add(id);
        mvc.perform(get("/api/rmas/{id}", id).with(user("viewer").roles("VIEWER")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.serialNumber").value("NAV69-SERIAL"));
    }

    @Test
    void securityStillProtectsEmptyIdentificationRecords() throws Exception {
        RmaRecord saved = fixture(false);
        mvc.perform(get("/api/rmas/{id}", saved.getId())).andExpect(status().isUnauthorized());
        mvc.perform(put("/api/rmas/{id}", saved.getId()).with(user("viewer").roles("VIEWER")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content("{\"priority\":\"HIGH\"}")).andExpect(status().isForbidden());
    }

    private List<Map<String, Object>> identifiedItems() {
        return List.of(Map.of("productId", product.getId(), "serialNumber", "NAV69-SERIAL"));
    }

    private Map<String, Object> row(String table, Long id) {
        return jdbc.queryForMap("select batch_number, serial_number, manufactured_at from " + table + " where id = ?", id);
    }

    private RmaRecord fixture(boolean withItem) {
        RmaRecord record = new RmaRecord();
        record.setCode("NAV69-" + UUID.randomUUID().toString().substring(0, 8));
        record.setClient(client);
        record.setProduct(product);
        record.setEntryDate(LocalDate.now(ZoneId.of("America/Sao_Paulo")));
        record.setReportedFailure("Failure");
        record.setPurchaseDateUnknown(true);
        record.setReceivedBy("admin");
        if (withItem) {
            RmaItem item = new RmaItem();
            item.setProduct(product);
            item.setWarrantyMonths(6);
            record.addItem(item);
        }
        RmaRecord saved = rmas.saveAndFlush(record);
        createdIds.add(saved.getId());
        return saved;
    }
}
