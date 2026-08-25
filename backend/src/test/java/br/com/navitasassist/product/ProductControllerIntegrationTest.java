package br.com.navitasassist.product;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.startsWith;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.Map;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.ProductRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.rma.RmaRecord;
import com.fasterxml.jackson.databind.ObjectMapper;
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
class ProductControllerIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private ClientRepository clientRepository;

    @Autowired
    private RmaRecordRepository rmaRecordRepository;

    @BeforeEach
    void cleanProducts() {
        rmaRecordRepository.deleteAll();
        productRepository.deleteAll();
        clientRepository.deleteAll();
    }

    @Test
    void shouldDeleteProduct() throws Exception {
        Product product = new Product();
        product.setSku("SKU-DELETE");
        product.setName("Product to delete");
        product.setDefaultWarrantyMonths(12);
        Product savedProduct = productRepository.save(product);

        mockMvc.perform(delete("/api/products/{id}", savedProduct.getId())
                .with(httpBasic("admin", "admin123")))
            .andExpect(status().isNoContent());

        assertFalse(productRepository.existsById(savedProduct.getId()));
    }

    @Test
    void shouldNotDeleteProductLinkedToRma() throws Exception {
        Product product = new Product();
        product.setSku("SKU-IN-USE");
        product.setName("Product in use");
        product.setDefaultWarrantyMonths(12);
        Product savedProduct = productRepository.save(product);

        Client client = new Client();
        client.setLegalName("Test client");
        Client savedClient = clientRepository.save(client);

        RmaRecord rma = new RmaRecord();
        rma.setCode("RMA-TEST-0001");
        rma.setProduct(savedProduct);
        rma.setClient(savedClient);
        rma.setEntryDate(LocalDate.now());
        rma.setReceivedBy("Test user");
        rma.setReportedFailure("Test failure");
        rmaRecordRepository.save(rma);

        mockMvc.perform(delete("/api/products/{id}", savedProduct.getId())
                .with(httpBasic("admin", "admin123")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value(
                "Product cannot be deleted because it is used by an RMA."
            ));

        assertTrue(productRepository.existsById(savedProduct.getId()));
    }

    @Test
    void shouldRejectSkuOverTwentyCharacters() throws Exception {
        mockMvc.perform(post("/api/products")
                .with(httpBasic("admin", "admin123"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(productJson("123456789012345678901", "Category", "Notes")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.details", hasItem(startsWith("sku:"))));
    }

    @Test
    void shouldRejectCategoryAndTechnicalNotesOverTheirLimits() throws Exception {
        mockMvc.perform(post("/api/products")
                .with(httpBasic("admin", "admin123"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(productJson("SKU-LIMITS", "C".repeat(81), "N".repeat(1001))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.details", hasItem(startsWith("category:"))))
            .andExpect(jsonPath("$.details", hasItem(startsWith("technicalNotes:"))));
    }

    private String productJson(String sku, String category, String technicalNotes) throws Exception {
        return objectMapper.writeValueAsString(Map.of(
            "sku", sku,
            "name", "Test product",
            "category", category,
            "defaultWarrantyMonths", 12,
            "technicalNotes", technicalNotes
        ));
    }
}
