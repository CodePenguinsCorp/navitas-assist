package br.com.navitasassist.client;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;

import br.com.navitasassist.product.Product;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.ProductRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.rma.RmaRecord;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ClientControllerIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

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
