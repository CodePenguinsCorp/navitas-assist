package br.com.navitasassist.pagination;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.hamcrest.Matchers.aMapWithSize;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.part.Part;
import br.com.navitasassist.repository.*;
import org.junit.jupiter.api.Test;
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
class DataMinimizationIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ClientRepository clients;
    @Autowired ProductRepository products;
    @Autowired PartRepository parts;

    @Test
    void selectorsReturnOnlyTheFieldsUsedByTheirConsumers() throws Exception {
        Client client = new Client();
        client.setLegalName("Cliente minimizado");
        client.setNotes("Informação interna");
        clients.saveAndFlush(client);
        Product product = new Product();
        product.setSku("MIN-OPTION");
        product.setName("Produto minimizado");
        product.setDefaultWarrantyMonths(12);
        product.setTechnicalNotes("Informação interna");
        products.saveAndFlush(product);
        Part part = new Part();
        part.setCode("MIN-OPTION");
        part.setName("Peça minimizada");
        part.setUnit("UN");
        parts.saveAndFlush(part);
        mvc.perform(get("/api/clients/options").with(user("reader")))
            .andExpect(status().isOk()).andExpect(jsonPath("$[0]", aMapWithSize(2)))
            .andExpect(jsonPath("$[0].legalName").exists());
        mvc.perform(get("/api/products/options").with(user("reader")))
            .andExpect(status().isOk()).andExpect(jsonPath("$[0]", aMapWithSize(3)))
            .andExpect(jsonPath("$[0].sku").exists());
        mvc.perform(get("/api/parts/options").with(user("reader")))
            .andExpect(status().isOk()).andExpect(jsonPath("$[0]", aMapWithSize(6)))
            .andExpect(jsonPath("$[0].available").exists());
    }
    @Test
    void summariesExposeOnlyTheCountersDisplayed() throws Exception {
        mvc.perform(get("/api/clients/summary").with(user("reader")))
            .andExpect(status().isOk()).andExpect(jsonPath("$", aMapWithSize(1)));
        mvc.perform(get("/api/products/summary").with(user("reader")))
            .andExpect(status().isOk()).andExpect(jsonPath("$", aMapWithSize(2)));
        mvc.perform(get("/api/users/summary").with(user("reader").authorities(
                new org.springframework.security.core.authority.SimpleGrantedAuthority("usuarios.gerir"))))
            .andExpect(status().isOk()).andExpect(jsonPath("$", aMapWithSize(1)));
    }
}
