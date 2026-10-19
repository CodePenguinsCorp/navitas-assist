package br.com.navitasassist.rma;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.ProductRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
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
class RmaControllerIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private ClientRepository clientRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private RmaRecordRepository rmaRecordRepository;

    @BeforeEach
    void cleanRmas() {
        rmaRecordRepository.deleteAll();
        productRepository.deleteAll();
        clientRepository.deleteAll();
    }

    @Test
    void shouldCreateRmaWithProductsFromDifferentBatches() throws Exception {
        Client client = new Client();
        client.setLegalName("Client with multiple products");
        Client savedClient = clientRepository.save(client);
        Product firstProduct = saveProduct("SKU-RMA-1", "First product", 12);
        Product secondProduct = saveProduct("SKU-RMA-2", "Second product", 24);

        Map<String, Object> payload = Map.of(
            "clientId", savedClient.getId(),
            "items", List.of(
                Map.of("productId", firstProduct.getId(), "batchNumber", "LOT-A"),
                Map.of("productId", secondProduct.getId(), "batchNumber", "LOT-B", "serialNumber", "SERIAL-B")
            ),
            "purchaseDateUnknown", true,
            "entryDate", LocalDate.now().toString(),
            "receivedBy", "Service desk",
            "reportedFailure", "Products do not start"
        );

        mockMvc.perform(post("/api/rmas")
                .with(user("admin").roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.items", hasSize(2)))
            .andExpect(jsonPath("$.items[0].productId").value(firstProduct.getId()))
            .andExpect(jsonPath("$.items[0].batchNumber").value("LOT-A"))
            .andExpect(jsonPath("$.items[1].productId").value(secondProduct.getId()))
            .andExpect(jsonPath("$.items[1].batchNumber").value("LOT-B"))
            .andExpect(jsonPath("$.items[1].serialNumber").value("SERIAL-B"));

        mockMvc.perform(get("/api/rmas/history")
                .param("batchNumber", "LOT-B")
                .with(user("admin").roles("ADMIN")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].items", hasSize(2)));

        mockMvc.perform(get("/api/rmas")
                .param("query", "SKU-RMA-2")
                .with(user("admin").roles("ADMIN")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    void shouldRejectProductWithoutBatchOrSerial() throws Exception {
        Client client = new Client();
        client.setLegalName("Validation client");
        Client savedClient = clientRepository.save(client);
        Product product = saveProduct("SKU-RMA-VALIDATION", "Validation product", 12);

        Map<String, Object> payload = Map.of(
            "clientId", savedClient.getId(),
            "items", List.of(Map.of("productId", product.getId())),
            "purchaseDateUnknown", true,
            "entryDate", LocalDate.now().toString(),
            "receivedBy", "Service desk",
            "reportedFailure", "Product does not start"
        );

        mockMvc.perform(post("/api/rmas")
                .with(user("admin").roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Each product must have at least a batch number or serial number."));
    }

    @Test
    void shouldRejectNullItemWithValidationError() throws Exception {
        Client client = new Client();
        client.setLegalName("Null item client");
        Client savedClient = clientRepository.save(client);

        String payload = """
            {
              "clientId": %d,
              "items": [null],
              "purchaseDateUnknown": true,
              "entryDate": "%s",
              "receivedBy": "Service desk",
              "reportedFailure": "Product does not start"
            }
            """.formatted(savedClient.getId(), LocalDate.now());

        mockMvc.perform(post("/api/rmas")
                .with(user("admin").roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(payload))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.details[0]", startsWith("items[0]:")));
    }

    @Test
    void shouldReplaceItemsAndRecalculateWarranty() throws Exception {
        Client client = new Client();
        client.setLegalName("RMA update client");
        Client savedClient = clientRepository.save(client);
        Product originalProduct = saveProduct("SKU-RMA-OLD", "Original product", 24);
        Product longWarrantyProduct = saveProduct("SKU-RMA-LONG", "Long warranty product", 24);
        Product shortWarrantyProduct = saveProduct("SKU-RMA-SHORT", "Short warranty product", 12);

        RmaRecord rma = new RmaRecord();
        rma.setCode("RMA-UPDATE-0001");
        rma.setClient(savedClient);
        rma.setProduct(originalProduct);
        rma.getItemIdentification().setBatchNumber("OLD-LOT");
        rma.setPurchaseDate(LocalDate.now().minusMonths(18));
        rma.setEntryDate(LocalDate.now());
        rma.setReceivedBy("Service desk");
        rma.setReportedFailure("Products do not start");

        RmaItem originalItem = new RmaItem();
        originalItem.setProduct(originalProduct);
        originalItem.getItemIdentification().setBatchNumber("OLD-LOT");
        rma.addItem(originalItem);
        RmaRecord savedRma = rmaRecordRepository.saveAndFlush(rma);

        Map<String, Object> payload = Map.of(
            "items", List.of(
                Map.of("productId", longWarrantyProduct.getId(), "batchNumber", "NEW-LOT-A"),
                Map.of("productId", shortWarrantyProduct.getId(), "serialNumber", "NEW-SERIAL-B")
            )
        );

        mockMvc.perform(put("/api/rmas/{id}", savedRma.getId())
                .with(user("admin").roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items", hasSize(2)))
            .andExpect(jsonPath("$.items[0].productId").value(longWarrantyProduct.getId()))
            .andExpect(jsonPath("$.items[1].productId").value(shortWarrantyProduct.getId()))
            .andExpect(jsonPath("$.productId").value(longWarrantyProduct.getId()))
            .andExpect(jsonPath("$.batchNumber").value("NEW-LOT-A"))
            .andExpect(jsonPath("$.warrantyStatus").value("OUT_OF_WARRANTY"));

        mockMvc.perform(get("/api/rmas/history")
                .param("batchNumber", "OLD-LOT")
                .with(user("admin").roles("ADMIN")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(0)));

        mockMvc.perform(get("/api/rmas/history")
                .param("serialNumber", "NEW-SERIAL-B")
                .with(user("admin").roles("ADMIN")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    void shouldExposeLegacyRmaAsSingleItem() throws Exception {
        Client client = new Client();
        client.setLegalName("Legacy RMA client");
        Client savedClient = clientRepository.save(client);
        Product product = saveProduct("SKU-RMA-LEGACY", "Legacy product", 12);

        RmaRecord rma = new RmaRecord();
        rma.setCode("RMA-LEGACY-0001");
        rma.setClient(savedClient);
        rma.setProduct(product);
        rma.getItemIdentification().setSerialNumber("LEGACY-SERIAL");
        rma.setPurchaseDateUnknown(true);
        rma.setEntryDate(LocalDate.now());
        rma.setReceivedBy("Service desk");
        rma.setReportedFailure("Legacy failure");
        RmaRecord savedRma = rmaRecordRepository.saveAndFlush(rma);

        mockMvc.perform(get("/api/rmas/{id}", savedRma.getId())
                .with(user("admin").roles("ADMIN")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items", hasSize(1)))
            .andExpect(jsonPath("$.items[0].id").doesNotExist())
            .andExpect(jsonPath("$.items[0].productId").value(product.getId()))
            .andExpect(jsonPath("$.items[0].serialNumber").value("LEGACY-SERIAL"));
    }

    private Product saveProduct(String sku, String name, int warrantyMonths) {
        Product product = new Product();
        product.setSku(sku);
        product.setName(name);
        product.setDefaultWarrantyMonths(warrantyMonths);
        return productRepository.save(product);
    }
}
