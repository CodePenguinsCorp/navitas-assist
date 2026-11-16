package br.com.navitasassist.rma;

import static br.com.navitasassist.access.AccessTestSupport.asProfile;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
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

    @Test
    void creationStillRequiresIdentificationAndPreservesProvidedData() throws Exception {
        var payload = new java.util.LinkedHashMap<String, Object>(Map.of("clientId", client.getId(),
            "purchaseDateUnknown", true,
            "entryDate", LocalDate.now(ZoneId.of("America/Sao_Paulo")).toString(), "reportedFailure", "Failure",
            "items", List.of(Map.of("productId", product.getId()))));
        mvc.perform(post("/api/rmas").with(asProfile("admin", "ADMIN")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(payload))).andExpect(status().isBadRequest());
        payload.put("items", identifiedItems());
        var response = mvc.perform(post("/api/rmas").with(asProfile("admin", "ADMIN")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(payload)))
            .andExpect(status().isCreated()).andReturn();
        long id = mapper.readTree(response.getResponse().getContentAsString()).get("id").asLong();
        createdIds.add(id);
        mvc.perform(get("/api/rmas/{id}", id).with(asProfile("viewer", "VIEWER")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].serialNumber").value("NAV69-SERIAL"));
    }

    private List<Map<String, Object>> identifiedItems() {
        return List.of(Map.of("productId", product.getId(), "serialNumber", "NAV69-SERIAL"));
    }

}
