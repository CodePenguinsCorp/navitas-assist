package br.com.navitasassist.rma;

import static br.com.navitasassist.access.AccessTestSupport.asProfile;
import static org.hamcrest.Matchers.aMapWithSize;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.ProductRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/** Indicadores do dashboard calculados no servidor; compara antes e depois para não depender de outras OS da base. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class RmaDashboardIntegrationTest {

    private static final LocalDate TODAY = LocalDate.now(ZoneId.of("America/Sao_Paulo"));

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private ClientRepository clients;
    @Autowired private ProductRepository products;

    @Test
    void aggregatesStatusPriorityWarrantyAndDeadlinesWithoutHistories() throws Exception {
        JsonNode before = dashboard();
        Product product = new Product();
        product.setSku("DASH-SKU");
        product.setName("Produto do dashboard");
        product.setDefaultWarrantyMonths(12);
        products.saveAndFlush(product);

        long overdueHigh = create("Dash A", product, "HIGH", LocalDate.of(2001, 1, 2), null, TODAY.minusDays(1));
        long dueSoonHigh = create("Dash B", product, "HIGH", LocalDate.of(2001, 1, 1), null, TODAY.plusDays(3));
        create("Dash C", product, "LOW", LocalDate.of(2001, 1, 1), LocalDate.of(2000, 12, 1), null);
        long closed = create("Dash D", product, "MEDIUM", LocalDate.of(2001, 1, 1), null, TODAY.minusDays(1));
        changeStatus(dueSoonHigh, "TRIAGE");
        changeStatus(closed, "COMPLETED");

        JsonNode after = dashboard();
        assertEquals(2, delta(before, after, "statusCounts", "RECEIVED"));
        assertEquals(1, delta(before, after, "statusCounts", "TRIAGE"));
        assertEquals(1, delta(before, after, "statusCounts", "COMPLETED"));
        assertEquals(2, after.get("initialQueueHighPriority").asLong() - before.get("initialQueueHighPriority").asLong());
        assertEquals(1, after.get("overdue").asLong() - before.get("overdue").asLong());
        assertEquals(1, after.get("dueSoon").asLong() - before.get("dueSoon").asLong());
        assertEquals(4, after.get("items").asLong() - before.get("items").asLong());
        assertEquals(1, after.get("itemsInWarranty").asLong() - before.get("itemsInWarranty").asLong());
        assertEquals(3, after.get("itemsPendingWarranty").asLong() - before.get("itemsPendingWarranty").asLong());

        mvc.perform(get("/api/rmas/dashboard").with(asProfile("viewer", "VIEWER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.statusHistory").doesNotExist())
            .andExpect(jsonPath("$.queue[0].id").value(dueSoonHigh))
            .andExpect(jsonPath("$.queue[0].clientName").value("Dash B"))
            .andExpect(jsonPath("$.queue[0].status").value("TRIAGE"))
            .andExpect(jsonPath("$.queue[0].priority").value("HIGH"))
            .andExpect(jsonPath("$.queue[0].entryDate").value("2001-01-01"))
            .andExpect(jsonPath("$.queue[0]", aMapWithSize(6)))
            .andExpect(jsonPath("$.queue[1].id").value(overdueHigh))
            .andExpect(jsonPath("$.recent", hasSize(4)))
            .andExpect(jsonPath("$.recent[*].clientName", containsInAnyOrder("Dash A", "Dash B", "Dash C", "Dash D")))
            .andExpect(jsonPath("$.recent[0]", aMapWithSize(5)))
            .andExpect(jsonPath("$.statusEvents", hasSize(4)))
            .andExpect(jsonPath("$.statusEvents[0].rmaId").value(closed))
            .andExpect(jsonPath("$.statusEvents[0].status").value("COMPLETED"))
            .andExpect(jsonPath("$.statusEvents[0].changedBy").value("tech"))
            .andExpect(jsonPath("$.statusEvents[0].note").value("Encerrada no teste"))
            .andExpect(jsonPath("$.statusEvents[0]", aMapWithSize(6)));
    }

    @Test
    void requiresRmaView() throws Exception {
        mvc.perform(get("/api/rmas/dashboard").with(user("other").authorities(new SimpleGrantedAuthority("relatorios.ver"))))
            .andExpect(status().isForbidden());
    }

    private JsonNode dashboard() throws Exception {
        String body = mvc.perform(get("/api/rmas/dashboard").with(asProfile("viewer", "VIEWER")))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return mapper.readTree(body);
    }

    private long delta(JsonNode before, JsonNode after, String map, String key) {
        return after.get(map).path(key).asLong() - before.get(map).path(key).asLong();
    }

    private long create(String clientName, Product product, String priority, LocalDate entry, LocalDate purchase, LocalDate due) throws Exception {
        Client client = new Client();
        client.setLegalName(clientName);
        clients.saveAndFlush(client);
        Map<String, Object> payload = new HashMap<>(Map.of(
            "clientId", client.getId(),
            "items", List.of(Map.of("productId", product.getId(), "serialNumber", clientName)),
            "purchaseDateUnknown", purchase == null,
            "entryDate", entry.toString(),
            "priority", priority,
            "reportedFailure", "Não liga"));
        if (purchase != null) payload.put("purchaseDate", purchase.toString());
        if (due != null) payload.put("dueDate", due.toString());
        String body = mvc.perform(post("/api/rmas").with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(payload)))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return mapper.readTree(body).get("id").asLong();
    }

    private void changeStatus(long id, String status) throws Exception {
        mvc.perform(patch("/api/rmas/{id}/status", id).with(asProfile("tech", "TECHNICIAN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("status", status, "note", "Encerrada no teste"))))
            .andExpect(status().isOk());
    }
}
