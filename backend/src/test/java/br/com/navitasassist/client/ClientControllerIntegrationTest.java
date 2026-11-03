package br.com.navitasassist.client;

import static org.junit.jupiter.api.Assertions.assertEquals;
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
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Stream;

import br.com.navitasassist.product.Product;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.ProductRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.rma.RmaRecord;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
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
                .with(user("admin").roles("ADMIN"))
                .with(csrf())
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
                    .with(user("admin").roles("ADMIN"))
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isBadRequest());
        }

        assertTrue(clientRepository.findAll().isEmpty());
    }

    @ParameterizedTest(name = "{0} {1}: {2}")
    @MethodSource("optionalClientFieldCases")
    void shouldPreserveOptionalFieldLimits(String method, String field, String scenario, String value, String expected, boolean valid) throws Exception {
        Client original = new Client();
        original.setLegalName("Cliente original");
        original.setTradeName("Nome preservado");
        original.setNotes("Nota preservada");
        Long id = method.equals("PUT") ? clientRepository.save(original).getId() : null;
        Map<String, String> payload = new LinkedHashMap<>(Map.of(
            "legalName", "Cliente atualizado", "tradeName", "Nome preservado", "notes", "Nota preservada"));
        payload.put(field, value);

        var result = mockMvc.perform((method.equals("POST") ? post("/api/clients") : put("/api/clients/{id}", id))
            .with(user("admin").roles("ADMIN"))
            .with(csrf())
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(payload)));

        if (!valid) {
            result.andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0]").value(org.hamcrest.Matchers.containsString(field)));
            assertEquals(method.equals("POST") ? 0L : 1L, clientRepository.count());
            if (id != null) {
                Client unchanged = clientRepository.findById(id).orElseThrow();
                assertEquals("Cliente original", unchanged.getLegalName());
                assertEquals("Nome preservado", unchanged.getTradeName());
                assertEquals("Nota preservada", unchanged.getNotes());
            }
            return;
        }

        result.andExpect(status().is(method.equals("POST") ? 201 : 200));
        var response = objectMapper.readTree(result.andReturn().getResponse().getContentAsByteArray());
        assertEquals(objectMapper.valueToTree(expected), response.get(field));
        Client saved = clientRepository.findById(response.get("id").asLong()).orElseThrow();
        assertEquals(1L, clientRepository.count());
        assertEquals("Cliente atualizado", saved.getLegalName());
        assertEquals(field.equals("tradeName") ? expected : "Nome preservado", saved.getTradeName());
        assertEquals(field.equals("notes") ? expected : "Nota preservada", saved.getNotes());
    }

    static Stream<Arguments> optionalClientFieldCases() {
        Stream.Builder<Arguments> cases = Stream.builder();
        for (String method : new String[] { "POST", "PUT" }) {
            for (String field : new String[] { "tradeName", "notes" }) {
                int limit = field.equals("tradeName") ? 120 : 1000;
                cases.add(Arguments.of(method, field, "null", null, null, true));
                cases.add(Arguments.of(method, field, "empty", "", "", true));
                cases.add(Arguments.of(method, field, "whitespace", "   ", "", true));
                cases.add(Arguments.of(method, field, "limit", "ç".repeat(limit), "ç".repeat(limit), true));
                cases.add(Arguments.of(method, field, "overflow", "a".repeat(limit + 1), null, false));
            }
        }
        return cases.build();
    }

    @Test
    void shouldDeleteClient() throws Exception {
        Client client = new Client();
        client.setLegalName("Client to delete");
        Client savedClient = clientRepository.save(client);

        mockMvc.perform(delete("/api/clients/{id}", savedClient.getId())
                .with(user("admin").roles("ADMIN"))
                .with(csrf()))
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
                .with(user("admin").roles("ADMIN"))
                .with(csrf()))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value(
                "Client cannot be deleted because it is used by an RMA."
            ));

        assertTrue(clientRepository.existsById(savedClient.getId()));
    }
}
