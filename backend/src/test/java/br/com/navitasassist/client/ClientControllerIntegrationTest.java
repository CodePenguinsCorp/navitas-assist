package br.com.navitasassist.client;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.Map;

import br.com.navitasassist.product.Product;
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
class ClientControllerIntegrationTest {

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
    void cleanClients() {
        rmaRecordRepository.deleteAll();
        productRepository.deleteAll();
        clientRepository.deleteAll();
    }

    @Test
    void shouldCreateClientWith120CharactersIgnoringSpacesAndDashes() throws Exception {
        String legalName = "A -–— ".repeat(119) + "Z";

        mockMvc.perform(post("/api/clients")
                .with(httpBasic("admin", "admin123"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "legalName", legalName, "phone", "1".repeat(30), "address", "A".repeat(255)))))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.legalName").value(legalName));

        assertTrue(clientRepository.findAll().stream()
            .anyMatch(client -> legalName.equals(client.getLegalName())));
    }

    @Test
    void shouldRejectClientFieldsExceedingLimits() throws Exception {
        for (Map<String, String> payload : java.util.List.of(
                Map.of("legalName", "A -".repeat(121)),
                Map.of("legalName", "Client", "phone", "1".repeat(31)),
                Map.of("legalName", "Client", "address", "A".repeat(256)))) {
            mockMvc.perform(post("/api/clients")
                    .with(httpBasic("admin", "admin123"))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isBadRequest());
        }

        assertTrue(clientRepository.findAll().isEmpty());
    }

    @Test
    void shouldDeleteClient() throws Exception {
        Client client = new Client();
        client.setLegalName("Client to delete");
        Client savedClient = clientRepository.save(client);

        mockMvc.perform(delete("/api/clients/{id}", savedClient.getId())
                .with(httpBasic("admin", "admin123")))
            .andExpect(status().isNoContent());

        assertFalse(clientRepository.existsById(savedClient.getId()));
    }

    @Test
    void shouldNotDeleteClientLinkedToRma() throws Exception {
        Client client = new Client();
        client.setLegalName("Client in use");
        Client savedClient = clientRepository.save(client);

        Product product = new Product();
        product.setSku("SKU-CLIENT-TEST");
        product.setName("Test product");
        product.setDefaultWarrantyMonths(12);
        Product savedProduct = productRepository.save(product);

        RmaRecord rma = new RmaRecord();
        rma.setCode("RMA-CLIENT-0001");
        rma.setProduct(savedProduct);
        rma.setClient(savedClient);
        rma.setEntryDate(LocalDate.now());
        rma.setReceivedBy("Test user");
        rma.setReportedFailure("Test failure");
        rmaRecordRepository.save(rma);

        mockMvc.perform(delete("/api/clients/{id}", savedClient.getId())
                .with(httpBasic("admin", "admin123")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value(
                "Client cannot be deleted because it is used by an RMA."
            ));

        assertTrue(clientRepository.existsById(savedClient.getId()));
    }
}
