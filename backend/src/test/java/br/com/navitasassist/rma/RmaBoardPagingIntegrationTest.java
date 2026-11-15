package br.com.navitasassist.rma;

import static br.com.navitasassist.access.AccessTestSupport.asProfile;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.ProductRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class RmaBoardPagingIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired ClientRepository clients;
    @Autowired ProductRepository products;
    @Autowired JdbcTemplate jdbc;
    @Autowired jakarta.persistence.EntityManager em;

    @Test
    void pagesAndCountsUseTheSameServerFilters() throws Exception {
        long a = create("PÁGINA-Á", "HIGH");
        long b = create("PÁGINA-B", "LOW");
        mvc.perform(get("/api/rmas/board/column").param("status", "RECEIVED").param("query", "pagina")
            .param("size", "1").with(asProfile("viewer", "VIEWER")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(2))
            .andExpect(jsonPath("$.cards[0].id").value(a)).andExpect(jsonPath("$.hasMore").value(true));
        mvc.perform(get("/api/rmas/board/column").param("status", "RECEIVED").param("query", "pagina")
            .param("size", "1").param("page", "1").with(asProfile("viewer", "VIEWER")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.cards[0].id").value(b)).andExpect(jsonPath("$.hasMore").value(false));
        mvc.perform(get("/api/rmas/board/counts").param("query", "pagina").param("priority", "LOW")
            .param("warranty", "PENDING").param("unassignedOnly", "true").param("blocked", "false")
            .with(asProfile("viewer", "VIEWER")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1))
            .andExpect(jsonPath("$.statusCounts.RECEIVED").value(1)).andExpect(jsonPath("$.highPriority").value(0));
        mvc.perform(get("/api/rmas/board/column").param("status", "RECEIVED").param("size", "101")
            .with(asProfile("viewer", "VIEWER"))).andExpect(status().isBadRequest());
        mvc.perform(get("/api/rmas/board/counts").param("unassignedOnly", "true").param("assigneeId", "1")
            .with(asProfile("viewer", "VIEWER"))).andExpect(status().isBadRequest());
        mvc.perform(get("/api/rmas/board/counts").param("query", "a".repeat(101))
            .with(asProfile("viewer", "VIEWER"))).andExpect(status().isBadRequest());
        mvc.perform(get("/api/rmas/board/counts").param("entryFrom", "2026-11-15").param("entryTo", "2026-11-01")
            .with(asProfile("viewer", "VIEWER"))).andExpect(status().isBadRequest());
    }

    @Test
    void insertionPinsTheAutomaticPrefixAndPreservesDatesAndHistory() throws Exception {
        long a = create("ORDEM-A", "HIGH");
        long b = create("ORDEM-B", "MEDIUM");
        long x = create("ORDEM-X", "LOW");
        var before = jdbc.queryForMap("select updated_at, (select count(*) from rma_status_history where rma_id = ?) as events from rmas where id = ?", x, x);
        move(x, "RECEIVED", a, b).andExpect(status().isOk());
        JsonNode page = column("ORDEM");
        assertEquals(List.of(a, x, b), mapper.convertValue(page.get("cards").findValues("id"), mapper.getTypeFactory().constructCollectionType(List.class, Long.class)));
        assertNotNull(jdbc.queryForObject("select board_position from rmas where id = ?", Long.class, a));
        assertNull(jdbc.queryForObject("select board_position from rmas where id = ?", Long.class, b));
        assertEquals(before, jdbc.queryForMap("select updated_at, (select count(*) from rma_status_history where rma_id = ?) as events from rmas where id = ?", x, x));
        move(x, "RECEIVED", b, a).andExpect(status().isBadRequest());
        move(x, "RECEIVED", x, null).andExpect(status().isBadRequest());
        move(x, "TRIAGE", null, null).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("TRIAGE"));
        mvc.perform(patch("/api/rmas/{id}/status", x).with(asProfile("tech", "TECHNICIAN")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"RECEIVED\"}")).andExpect(status().isOk());
        em.flush();
        assertNull(jdbc.queryForObject("select board_position from rmas where id = ?", Long.class, x));
    }

    @Test
    void writesRequireStatusPermissionAndCsrf() throws Exception {
        long id = create("SEGURANÇA", "LOW");
        mvc.perform(put("/api/rmas/{id}/board-position", id).with(asProfile("viewer", "VIEWER")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"RECEIVED\"}")).andExpect(status().isForbidden());
        mvc.perform(put("/api/rmas/{id}/board-position", id).with(asProfile("tech", "TECHNICIAN"))
            .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"RECEIVED\"}")).andExpect(status().isForbidden());
    }

    @Test
    void effectiveWarrantyDeadlinesAndCivilDatesApplyToPagesAndCounts() throws Exception {
        long id = create("FILTRO-ITENS", "HIGH");
        jdbc.update("update rmas set purchase_date_unknown = false, purchase_date = '2020-01-31', due_date = ?, updated_at = '2026-11-15T02:30:00Z' where id = ?",
            LocalDate.now(java.time.ZoneId.of("America/Sao_Paulo")).minusDays(1), id);
        jdbc.update("update rma_items set warranty_override = 'IN_WARRANTY' where rma_id = ?", id);
        for (String endpoint : List.of("column", "counts")) {
            mvc.perform(get("/api/rmas/board/" + endpoint).param("status", "RECEIVED").param("query", "filtro-itens")
                .param("warranty", "IN_WARRANTY").param("deadline", "OVERDUE")
                .param("updatedFrom", "2026-11-14").param("updatedTo", "2026-11-14")
                .with(asProfile("viewer", "VIEWER"))).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1));
            mvc.perform(get("/api/rmas/board/" + endpoint).param("status", "RECEIVED").param("query", "filtro-itens")
                .param("updatedFrom", "2026-11-15").with(asProfile("viewer", "VIEWER")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
        }
    }

    @Test
    void filteredNonAdjacentNeighborsAndExhaustedGapsPreserveInsertionPoint() throws Exception {
        long a = create("INTERVALO-A", "HIGH");
        long b = create("INTERVALO-B", "MEDIUM");
        long c = create("INTERVALO-C", "LOW");
        long x = create("INTERVALO-X", "LOW");
        jdbc.update("update rmas set board_position = 1 where id = ?", a);
        jdbc.update("update rmas set board_position = 2 where id = ?", b);
        jdbc.update("update rmas set board_position = 3 where id = ?", c);
        move(x, "RECEIVED", a, c).andExpect(status().isOk());
        assertEquals(List.of(a, b, x, c), jdbc.queryForList("select r.id from rmas r where r.id in (?, ?, ?, ?) order by r.board_position", Long.class, a, b, c, x));
        move(a, "TRIAGE", null, b).andExpect(status().isBadRequest());
    }

    private org.springframework.test.web.servlet.ResultActions move(long id, String target, Long after, Long before) throws Exception {
        var body = new java.util.HashMap<String, Object>();
        body.put("status", target); body.put("afterId", after); body.put("beforeId", before);
        return mvc.perform(put("/api/rmas/{id}/board-position", id).with(asProfile("tech", "TECHNICIAN")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body)));
    }

    private JsonNode column(String query) throws Exception {
        return mapper.readTree(mvc.perform(get("/api/rmas/board/column").param("status", "RECEIVED").param("query", query)
            .with(asProfile("viewer", "VIEWER"))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private long create(String name, String priority) throws Exception {
        Client client = new Client(); client.setLegalName(name); clients.saveAndFlush(client);
        Product product = new Product(); product.setName(name); product.setSku(name); product.setDefaultWarrantyMonths(12); products.saveAndFlush(product);
        return mapper.readTree(mvc.perform(post("/api/rmas").with(asProfile("admin", "ADMIN")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(Map.of("clientId", client.getId(),
                "items", List.of(Map.of("productId", product.getId(), "serialNumber", name)), "purchaseDateUnknown", true,
                "entryDate", LocalDate.of(2026, 1, 1).toString(), "reportedFailure", "Não liga", "priority", priority))))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asLong();
    }
}
