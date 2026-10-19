package br.com.navitasassist.client;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.startsWith;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
                    "legalName", legalName, "phone", "1".repeat(20), "address", "A".repeat(255)))))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.legalName").value(legalName))
            .andExpect(jsonPath("$.phone").value("1".repeat(20)));

        assertTrue(clientRepository.findAll().stream()
            .anyMatch(client -> legalName.equals(client.getLegalName())));
        assertEquals("1".repeat(20), clientRepository.findAll().get(0).getPhone());
    }

    @Test
    void shouldUpdateClientWithoutErasingContactNameWhenOmitted() throws Exception {
        Client client = new Client();
        client.setLegalName("Test client");
        client.setContactName("Existing contact");
        Client savedClient = clientRepository.save(client);

        mockMvc.perform(put("/api/clients/{id}", savedClient.getId())
                .with(httpBasic("admin", "admin123"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "legalName", "Updated client",
                    "phone", "47999999999",
                    "email", "client@example.com"
                ))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.phone").value("47999999999"))
            .andExpect(jsonPath("$.email").value("client@example.com"));

        Client updatedClient = clientRepository.findById(savedClient.getId()).orElseThrow();
        assertEquals("Existing contact", updatedClient.getContactName());
        assertEquals("Updated client", updatedClient.getLegalName());
        assertEquals("47999999999", updatedClient.getPhone());
        assertEquals("client@example.com", updatedClient.getEmail());
    }

    @Test
    void shouldRejectClientFieldsExceedingLimits() throws Exception {
        for (Map<String, String> payload : java.util.List.of(
                Map.of("legalName", "A -".repeat(121)),
                Map.of("legalName", "Client", "phone", "1".repeat(21)),
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
    void shouldUpdateClientWithTwentyCharacterPhone() throws Exception {
        Client client = new Client();
        client.setLegalName("Test client");
        Client savedClient = clientRepository.save(client);
        String phone = "1".repeat(20);

        mockMvc.perform(put("/api/clients/{id}", savedClient.getId())
                .with(httpBasic("admin", "admin123"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("legalName", "Test client", "phone", phone))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.phone").value(phone));

        assertEquals(phone, clientRepository.findById(savedClient.getId()).orElseThrow().getPhone());
    }

    @Test
    void shouldRejectPhoneOverTwentyCharactersOnUpdate() throws Exception {
        Client client = new Client();
        client.setLegalName("Test client");
        client.setPhone("47999999999");
        Client savedClient = clientRepository.save(client);

        mockMvc.perform(put("/api/clients/{id}", savedClient.getId())
                .with(httpBasic("admin", "admin123"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("legalName", "Test client", "phone", "1".repeat(21)))))
            .andExpect(status().isBadRequest());

        assertEquals("47999999999", clientRepository.findById(savedClient.getId()).orElseThrow().getPhone());
    }

    @Test
    void shouldCreateClientWithPhonePunctuation() throws Exception {
        String phone = "+1 (2) 3-4.5#*";

        mockMvc.perform(post("/api/clients")
                .with(httpBasic("admin", "admin123"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("legalName", "Test client", "phone", phone))))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.phone").value(phone));

        assertEquals(phone, clientRepository.findAll().get(0).getPhone());
    }

    @Test
    void shouldUpdateClientWithPhonePunctuation() throws Exception {
        Client client = new Client();
        client.setLegalName("Test client");
        Client savedClient = clientRepository.save(client);
        String phone = "+1 (2) 3-4.5#*";

        mockMvc.perform(put("/api/clients/{id}", savedClient.getId())
                .with(httpBasic("admin", "admin123"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("legalName", "Test client", "phone", phone))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.phone").value(phone));

        assertEquals(phone, clientRepository.findById(savedClient.getId()).orElseThrow().getPhone());
    }

    @Test
    void shouldRejectInvalidPhoneCharactersOnCreate() throws Exception {
        for (String phone : java.util.List.of("47999A1234", "47@9991234", "47/9991234", "47\n9991234")) {
            mockMvc.perform(post("/api/clients")
                    .with(httpBasic("admin", "admin123"))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(Map.of("legalName", "Test client", "phone", phone))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details", hasItem(startsWith("phone:"))));
        }

        assertTrue(clientRepository.findAll().isEmpty());
    }

    @Test
    void shouldRejectInvalidPhoneCharactersOnUpdate() throws Exception {
        Client client = new Client();
        client.setLegalName("Test client");
        client.setPhone("47999999999");
        Client savedClient = clientRepository.save(client);

        for (String phone : java.util.List.of("47999A1234", "47@9991234", "47/9991234", "47\n9991234")) {
            mockMvc.perform(put("/api/clients/{id}", savedClient.getId())
                    .with(httpBasic("admin", "admin123"))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(Map.of("legalName", "Test client", "phone", phone))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details", hasItem(startsWith("phone:"))));
        }

        assertEquals("47999999999", clientRepository.findById(savedClient.getId()).orElseThrow().getPhone());
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
