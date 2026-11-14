package br.com.navitasassist.rma;

import static br.com.navitasassist.access.AccessTestSupport.asProfile;
import static org.hamcrest.Matchers.aMapWithSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.ProductRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/** Lista e Kanban levam só os resumos; o detalhe e as respostas das escritas continuam completos. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class RmaCollectionContractIntegrationTest {

    private static final LocalDate TODAY = LocalDate.now(ZoneId.of("America/Sao_Paulo"));

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private ClientRepository clients;
    @Autowired private ProductRepository products;

    @Test
    void listAndBoardCarryOnlySummariesWhileDetailAndWritesStayComplete() throws Exception {
        long id = createBlockedRmaWithNote("COLL-SUMMARY");

        mvc.perform(get("/api/rmas").param("query", "COLL-SUMMARY").with(asProfile("viewer", "VIEWER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content[0].id").value(id))
            .andExpect(jsonPath("$.content[0]", aMapWithSize(7)))
            .andExpect(jsonPath("$.content[0].items[0]", aMapWithSize(6)))
            .andExpect(jsonPath("$.content[0].items[0].serialNumber").value("COLL-SUMMARY"))
            .andExpect(jsonPath("$.content[0].statusHistory").doesNotExist())
            .andExpect(jsonPath("$.content[0].reportedFailure").doesNotExist());

        mvc.perform(get("/api/rmas/board").param("query", "COLL-SUMMARY").with(asProfile("viewer", "VIEWER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].id").value(id))
            .andExpect(jsonPath("$[0]", aMapWithSize(14)))
            .andExpect(jsonPath("$[0].items[0]", aMapWithSize(6)))
            .andExpect(jsonPath("$[0].currentBlock", aMapWithSize(2)))
            .andExpect(jsonPath("$[0].currentBlock.reason").value("Aguardando cliente"))
            .andExpect(jsonPath("$[0].stagePeriods[0].status").value("RECEIVED"))
            .andExpect(jsonPath("$[0].deadline.status").value("ON_TRACK"))
            .andExpect(jsonPath("$[0].statusHistory").doesNotExist())
            .andExpect(jsonPath("$[0].blockHistory").doesNotExist())
            .andExpect(jsonPath("$[0].diagnosis").doesNotExist())
            .andExpect(jsonPath("$[0].reportedFailure").doesNotExist())
            .andExpect(jsonPath("$[0].receivedAccessories").doesNotExist());

        mvc.perform(get("/api/rmas/{id}", id).with(asProfile("viewer", "VIEWER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.reportedFailure").value("Não liga"))
            .andExpect(jsonPath("$.statusHistory[0].note").exists())
            .andExpect(jsonPath("$.blockHistory[0].category").value("Cliente"));

        mvc.perform(patch("/api/rmas/{id}/status", id).with(asProfile("tech", "TECHNICIAN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"TRIAGE\",\"note\":\"Em triagem\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.reportedFailure").value("Não liga"))
            .andExpect(jsonPath("$.blockHistory[0].reason").value("Aguardando cliente"))
            .andExpect(jsonPath("$.statusHistory[1].note").value("Em triagem"));
    }

    private long createBlockedRmaWithNote(String serial) throws Exception {
        Client client = new Client();
        client.setLegalName("Cliente " + serial);
        clients.saveAndFlush(client);
        Product product = new Product();
        product.setSku(serial);
        product.setName("Produto " + serial);
        product.setDefaultWarrantyMonths(12);
        products.saveAndFlush(product);
        String body = mvc.perform(post("/api/rmas").with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(Map.of(
                    "clientId", client.getId(),
                    "items", List.of(Map.of("productId", product.getId(), "serialNumber", serial)),
                    "purchaseDateUnknown", true,
                    "entryDate", TODAY.toString(),
                    "dueDate", TODAY.plusDays(30).toString(),
                    "reportedFailure", "Não liga",
                    "receivedAccessories", "Fonte"))))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        long id = mapper.readTree(body).get("id").asLong();
        mvc.perform(post("/api/rmas/{id}/blocks", id).with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Aguardando cliente\",\"category\":\"Cliente\"}"))
            .andExpect(status().isOk());
        return id;
    }
}
