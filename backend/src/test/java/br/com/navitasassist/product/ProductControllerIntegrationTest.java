package br.com.navitasassist.product;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.startsWith;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.Map;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.ProductRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.rma.RmaItem;
import br.com.navitasassist.rma.RmaRecord;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
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
                .with(user("admin").roles("ADMIN"))
                .with(csrf()))
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
                .with(user("admin").roles("ADMIN"))
                .with(csrf()))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value(
                "Product cannot be deleted because it is used by an RMA."
            ));

        assertTrue(productRepository.existsById(savedProduct.getId()));
    }

    @Test
    void shouldNotDeleteProductLinkedAsSecondaryRmaItem() throws Exception {
        Product primaryProduct = new Product();
        primaryProduct.setSku("SKU-RMA-PRIMARY");
        primaryProduct.setName("Primary RMA product");
        Product savedPrimaryProduct = productRepository.save(primaryProduct);

        Product secondaryProduct = new Product();
        secondaryProduct.setSku("SKU-RMA-SECONDARY");
        secondaryProduct.setName("Secondary RMA product");
        Product savedSecondaryProduct = productRepository.save(secondaryProduct);

        Client client = new Client();
        client.setLegalName("Multiple product client");
        Client savedClient = clientRepository.save(client);

        RmaRecord rma = new RmaRecord();
        rma.setCode("RMA-TEST-SECONDARY");
        rma.setProduct(savedPrimaryProduct);
        rma.getItemIdentification().setBatchNumber("PRIMARY-LOT");
        rma.setClient(savedClient);
        rma.setEntryDate(LocalDate.now());
        rma.setReceivedBy("Test user");
        rma.setReportedFailure("Test failure");

        RmaItem primaryItem = new RmaItem();
        primaryItem.setProduct(savedPrimaryProduct);
        primaryItem.getItemIdentification().setBatchNumber("PRIMARY-LOT");
        rma.addItem(primaryItem);

        RmaItem secondaryItem = new RmaItem();
        secondaryItem.setProduct(savedSecondaryProduct);
        secondaryItem.getItemIdentification().setSerialNumber("SECONDARY-SERIAL");
        rma.addItem(secondaryItem);
        rmaRecordRepository.saveAndFlush(rma);

        mockMvc.perform(delete("/api/products/{id}", savedSecondaryProduct.getId())
                .with(user("admin").roles("ADMIN"))
                .with(csrf()))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value(
                "Product cannot be deleted because it is used by an RMA."
            ));

        assertTrue(productRepository.existsById(savedSecondaryProduct.getId()));
    }

    @Test
    void shouldRejectSkuOverTwentyCharacters() throws Exception {
        mockMvc.perform(post("/api/products")
                .with(user("admin").roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(productJson("123456789012345678901", "Category", "Notes")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.details", hasItem(startsWith("sku:"))));
    }

    @Test
    void shouldRejectCategoryAndTechnicalNotesOverTheirLimits() throws Exception {
        mockMvc.perform(post("/api/products")
                .with(user("admin").roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(productJson("SKU-LIMITS", "C".repeat(81), "N".repeat(1001))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.details", hasItem(startsWith("category:"))))
            .andExpect(jsonPath("$.details", hasItem(startsWith("technicalNotes:"))));
    }

    @ParameterizedTest
    @ValueSource(strings = {"SKU-EXISTS", "sku-exists", " SKU-EXISTS ", " sku-exists ", "\tSKU-EXISTS\t"})
    void shouldRejectDuplicateSkuOnCreateAfterNormalization(String sku) throws Exception {
        Product existing = createProduct("SKU-EXISTS");

        mockMvc.perform(post("/api/products")
                .with(user("admin").roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(productJson(sku, "Category", "Notes")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.status").value(400))
            .andExpect(jsonPath("$.message").value("SKU already registered: " + sku.trim()))
            .andExpect(jsonPath("$.details").isEmpty());

        assertThat(productRepository.count()).isEqualTo(1);
        assertThat(productRepository.findById(existing.getId()).orElseThrow().getSku()).isEqualTo("SKU-EXISTS");
    }

    @ParameterizedTest
    @ValueSource(strings = {"SKU-EXISTS", "sku-exists", " SKU-EXISTS ", " sku-exists ", "\tSKU-EXISTS\t"})
    void shouldRejectDuplicateSkuOnUpdateWithoutPartialChanges(String sku) throws Exception {
        createProduct("SKU-EXISTS");
        Product edited = createProduct("SKU-EDITED");

        mockMvc.perform(put("/api/products/{id}", edited.getId())
                .with(user("admin").roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(productJson(sku, "Changed category", "Changed notes")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.status").value(400))
            .andExpect(jsonPath("$.message").value("SKU already registered: " + sku.trim()));

        assertThat(productRepository.count()).isEqualTo(2);
        Product persisted = productRepository.findById(edited.getId()).orElseThrow();
        assertThat(persisted.getSku()).isEqualTo("SKU-EDITED");
        assertThat(persisted.getName()).isEqualTo("Original product");
        assertThat(persisted.getCategory()).isNull();
        assertThat(persisted.getTechnicalNotes()).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"SKU-SELF", " SKU-SELF ", " sku-self "})
    void shouldAllowOwnNormalizedSkuOnUpdate(String sku) throws Exception {
        Product product = createProduct("SKU-SELF");

        mockMvc.perform(put("/api/products/{id}", product.getId())
                .with(user("service.desk").roles("SERVICE_DESK"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(productJson(sku, "Category", "Notes")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(product.getId()))
            .andExpect(jsonPath("$.sku").value(sku.trim()));

        assertThat(productRepository.count()).isEqualTo(1);
        assertThat(productRepository.findById(product.getId()).orElseThrow().getSku()).isEqualTo(sku.trim());
    }

    @Test
    void shouldNormalizeUniqueSkusWithoutRemovingInternalSpaces() throws Exception {
        String response = mockMvc.perform(post("/api/products")
                .with(user("admin").roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(productJson(" SKU NEW ", "Category", "Notes")))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.sku").value("SKU NEW"))
            .andReturn().getResponse().getContentAsString();
        long id = objectMapper.readTree(response).get("id").asLong();
        assertThat(productRepository.findById(id).orElseThrow().getSku()).isEqualTo("SKU NEW");

        mockMvc.perform(put("/api/products/{id}", id)
                .with(user("admin").roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(productJson(" SKU NEXT ", "Category", "Notes")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.sku").value("SKU NEXT"));

        assertThat(productRepository.count()).isEqualTo(1);
        assertThat(productRepository.findById(id).orElseThrow().getSku()).isEqualTo("SKU NEXT");
    }

    @ParameterizedTest
    @ValueSource(strings = {"VIEWER", "TECHNICIAN"})
    void shouldRejectProductWritesFromUnauthorizedRoles(String role) throws Exception {
        Product product = createProduct("SKU-PROTECTED");
        String body = productJson(" SKU NEW ", "Category", "Notes");

        mockMvc.perform(post("/api/products")
                .with(user("unauthorized").roles(role)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isForbidden());
        mockMvc.perform(put("/api/products/{id}", product.getId())
                .with(user("unauthorized").roles(role)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isForbidden());

        assertThat(productRepository.count()).isEqualTo(1);
        assertThat(productRepository.findById(product.getId()).orElseThrow().getSku()).isEqualTo("SKU-PROTECTED");
    }

    @Test
    void shouldRejectProductWritesWithoutCsrf() throws Exception {
        Product product = createProduct("SKU-CSRF");
        String body = productJson(" SKU NEW ", "Category", "Notes");

        mockMvc.perform(post("/api/products").with(user("admin").roles("ADMIN"))
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isForbidden());
        mockMvc.perform(put("/api/products/{id}", product.getId()).with(user("admin").roles("ADMIN"))
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isForbidden());

        assertThat(productRepository.count()).isEqualTo(1);
        assertThat(productRepository.findById(product.getId()).orElseThrow().getSku()).isEqualTo("SKU-CSRF");
    }

    @Test
    void shouldKeepSkuLengthLimitOnUpdate() throws Exception {
        Product product = createProduct("SKU-LIMIT");

        mockMvc.perform(put("/api/products/{id}", product.getId())
                .with(user("admin").roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(productJson("123456789012345678901", "Category", "Notes")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.details", hasItem(startsWith("sku:"))));

        assertThat(productRepository.findById(product.getId()).orElseThrow().getSku()).isEqualTo("SKU-LIMIT");
    }

    private Product createProduct(String sku) {
        Product product = new Product();
        product.setSku(sku);
        product.setName("Original product");
        return productRepository.saveAndFlush(product);
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
