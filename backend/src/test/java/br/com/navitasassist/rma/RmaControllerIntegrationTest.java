package br.com.navitasassist.rma;

import static br.com.navitasassist.access.AccessTestSupport.asProfile;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

import br.com.navitasassist.access.AccessTestSupport;
import br.com.navitasassist.repository.AccessProfileRepository;
import br.com.navitasassist.client.Client;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.ProductRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.user.UserAccount;
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
class RmaControllerIntegrationTest {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Sao_Paulo");

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

    @Autowired
    private UserAccountRepository userAccountRepository;

    @Autowired
    private AccessProfileRepository accessProfiles;

    @BeforeEach
    void cleanRmas() {
        rmaRecordRepository.deleteAll();
        productRepository.deleteAll();
        clientRepository.deleteAll();
        userAccountRepository.findAll().stream()
            .filter(user -> !user.getUsername().equalsIgnoreCase("admin"))
            .forEach(userAccountRepository::delete);
    }

    @Test
    void shouldCreateRmaWithProductsFromDifferentBatches() throws Exception {
        Client client = new Client();
        client.setLegalName("Client with multiple products");
        Client savedClient = clientRepository.save(client);
        Product firstProduct = saveProduct("SKU-OS-1", "First product", 12);
        Product secondProduct = saveProduct("SKU-OS-2", "Second product", 24);

        Map<String, Object> payload = Map.of(
            "clientId", savedClient.getId(),
            "items", List.of(
                Map.of("productId", firstProduct.getId(), "batchNumber", "LOT-A"),
                Map.of("productId", secondProduct.getId(), "batchNumber", "LOT-B", "serialNumber", "SERIAL-B")
            ),
            "purchaseDateUnknown", true,
            "entryDate", LocalDate.now().toString(),
            "invoiceNumber", "NF-123",
            "reportedFailure", "Products do not start",
            "receivedBy", "admin"
        );

        mockMvc.perform(post("/api/rmas")
                .with(asProfile("admin", "ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.receivedBy").value("admin"))
            .andExpect(jsonPath("$.invoiceNumber").value("NF-123"))
            .andExpect(jsonPath("$.invoiceFileName").doesNotExist())
            .andExpect(jsonPath("$.items", hasSize(2)))
            .andExpect(jsonPath("$.items[0].productId").value(firstProduct.getId()))
            .andExpect(jsonPath("$.items[0].batchNumber").value("LOT-A"))
            .andExpect(jsonPath("$.items[1].productId").value(secondProduct.getId()))
            .andExpect(jsonPath("$.items[1].batchNumber").value("LOT-B"))
            .andExpect(jsonPath("$.items[1].serialNumber").value("SERIAL-B"))
            .andExpect(jsonPath("$.items[0].warrantyMonths").value(12))
            .andExpect(jsonPath("$.items[1].warrantyMonths").value(24))
            .andExpect(jsonPath("$.items[0].warrantyStatus").value("PENDING"))
            .andExpect(jsonPath("$.items[1].warrantyStatus").value("PENDING"))
            .andExpect(jsonPath("$.items[0].warrantyExpiresAt").doesNotExist())
            .andExpect(jsonPath("$.warrantyStatus").doesNotExist())
            .andExpect(jsonPath("$.warrantyOverridden").doesNotExist());

        mockMvc.perform(get("/api/rmas")
                .param("query", "LOT-B")
                .with(asProfile("admin", "ADMIN")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content", hasSize(1)))
            .andExpect(jsonPath("$.content[0].items", hasSize(2)));

        mockMvc.perform(get("/api/rmas")
                .param("query", "SKU-OS-2")
                .with(asProfile("admin", "ADMIN")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content", hasSize(1)))
            .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void shouldRejectProductWithoutBatchOrSerial() throws Exception {
        Client client = new Client();
        client.setLegalName("Validation client");
        Client savedClient = clientRepository.save(client);
        Product product = saveProduct("SKU-OS-VALIDATION", "Validation product", 12);

        Map<String, Object> payload = Map.of(
            "clientId", savedClient.getId(),
            "items", List.of(Map.of("productId", product.getId())),
            "purchaseDateUnknown", true,
            "entryDate", LocalDate.now().toString(),
            "receivedBy", "Service desk",
            "reportedFailure", "Product does not start"
        );

        mockMvc.perform(post("/api/rmas")
                .with(asProfile("admin", "ADMIN"))
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
                .with(asProfile("admin", "ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(payload))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.details[0]", startsWith("items[0]:")));
    }

    @Test
    void shouldRejectInconsistentRmaDates() throws Exception {
        Client client = new Client();
        client.setLegalName("Date validation client");
        Client savedClient = clientRepository.save(client);
        Product product = saveProduct("SKU-OS-DATES", "Date validation product", 12);
        LocalDate today = LocalDate.now(BUSINESS_ZONE);

        Map<String, Object> futureManufacturing = Map.of(
            "clientId", savedClient.getId(),
            "items", List.of(Map.of("productId", product.getId(), "serialNumber", "FUTURE", "manufacturedAt", today.plusDays(1).toString())),
            "purchaseDateUnknown", true,
            "entryDate", today.toString(),
            "receivedBy", "Service desk",
            "reportedFailure", "Product does not start"
        );
        mockMvc.perform(post("/api/rmas")
                .with(asProfile("admin", "ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(futureManufacturing)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Manufacturing date cannot be after today."));

        Map<String, Object> purchaseBeforeManufacturing = Map.of(
            "clientId", savedClient.getId(),
            "items", List.of(Map.of("productId", product.getId(), "serialNumber", "PURCHASE", "manufacturedAt", today.minusDays(1).toString())),
            "purchaseDate", today.minusDays(2).toString(),
            "entryDate", today.toString(),
            "receivedBy", "Service desk",
            "reportedFailure", "Product does not start"
        );
        mockMvc.perform(post("/api/rmas")
                .with(asProfile("admin", "ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(purchaseBeforeManufacturing)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Purchase date cannot be before manufacturing date."));

        Map<String, Object> entryBeforePurchase = Map.of(
            "clientId", savedClient.getId(),
            "items", List.of(Map.of("productId", product.getId(), "serialNumber", "ENTRY")),
            "purchaseDate", today.toString(),
            "entryDate", today.minusDays(1).toString(),
            "receivedBy", "Service desk",
            "reportedFailure", "Product does not start"
        );
        mockMvc.perform(post("/api/rmas")
                .with(asProfile("admin", "ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(entryBeforePurchase)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Entry date cannot be before purchase date."));
    }

    @Test
    void shouldRejectReportedFailureAboveNewRmaLimit() throws Exception {
        Client client = new Client();
        client.setLegalName("Text limit client");
        Client savedClient = clientRepository.save(client);
        Product product = saveProduct("SKU-OS-LIMIT", "Text limit product", 12);

        Map<String, Object> payload = Map.of(
            "clientId", savedClient.getId(),
            "items", List.of(Map.of("productId", product.getId(), "serialNumber", "LIMIT")),
            "purchaseDateUnknown", true,
            "entryDate", LocalDate.now(BUSINESS_ZONE).toString(),
            "receivedBy", "Service desk",
            "reportedFailure", "x".repeat(1001)
        );

        mockMvc.perform(post("/api/rmas")
                .with(asProfile("admin", "ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.details[0]", startsWith("reportedFailure:")));
    }

    @Test
    void shouldReplaceItemsAndRecalculateWarranty() throws Exception {
        Client client = new Client();
        client.setLegalName("OS update client");
        Client savedClient = clientRepository.save(client);
        Product originalProduct = saveProduct("SKU-OS-OLD", "Original product", 24);
        Product longWarrantyProduct = saveProduct("SKU-OS-LONG", "Long warranty product", 24);
        Product shortWarrantyProduct = saveProduct("SKU-OS-SHORT", "Short warranty product", 12);

        RmaRecord rma = new RmaRecord();
        rma.setCode("OS-UPDATE-0001");
        rma.setClient(savedClient);
        rma.setProduct(originalProduct);
        rma.getItemIdentification().setBatchNumber("OLD-LOT");
        rma.setPurchaseDate(LocalDate.of(2025, 1, 1));
        rma.setEntryDate(LocalDate.of(2026, 7, 1));
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
                .with(asProfile("admin", "ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items", hasSize(2)))
            .andExpect(jsonPath("$.items[0].productId").value(longWarrantyProduct.getId()))
            .andExpect(jsonPath("$.items[1].productId").value(shortWarrantyProduct.getId()))
            .andExpect(jsonPath("$.productId").value(longWarrantyProduct.getId()))
            .andExpect(jsonPath("$.batchNumber").value("NEW-LOT-A"))
            .andExpect(jsonPath("$.items[0].warrantyStatus").value("IN_WARRANTY"))
            .andExpect(jsonPath("$.items[0].warrantyExpiresAt").value("2027-01-01"))
            .andExpect(jsonPath("$.items[1].warrantyStatus").value("OUT_OF_WARRANTY"))
            .andExpect(jsonPath("$.items[1].warrantyExpiresAt").value("2026-01-01"))
            .andExpect(jsonPath("$.warrantyStatus").doesNotExist());

        mockMvc.perform(get("/api/rmas")
                .param("query", "OLD-LOT")
                .with(asProfile("admin", "ADMIN")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content", hasSize(0)));

        mockMvc.perform(get("/api/rmas")
                .param("query", "NEW-SERIAL-B")
                .with(asProfile("admin", "ADMIN")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content", hasSize(1)));
    }

    @Test
    void shouldExposeLegacyRmaAsSingleItem() throws Exception {
        Client client = new Client();
        client.setLegalName("Legacy OS client");
        Client savedClient = clientRepository.save(client);
        Product product = saveProduct("SKU-OS-LEGACY", "Legacy product", 12);

        RmaRecord rma = new RmaRecord();
        rma.setCode("OS-LEGACY-0001");
        rma.setClient(savedClient);
        rma.setProduct(product);
        rma.getItemIdentification().setSerialNumber("LEGACY-SERIAL");
        rma.setPurchaseDateUnknown(true);
        rma.setEntryDate(LocalDate.now());
        rma.setReceivedBy("Service desk");
        rma.setReportedFailure("Legacy failure");
        RmaRecord savedRma = rmaRecordRepository.saveAndFlush(rma);

        mockMvc.perform(get("/api/rmas/{id}", savedRma.getId())
                .with(asProfile("admin", "ADMIN")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items", hasSize(1)))
            .andExpect(jsonPath("$.items[0].id").doesNotExist())
            .andExpect(jsonPath("$.items[0].productId").value(product.getId()))
            .andExpect(jsonPath("$.items[0].serialNumber").value("LEGACY-SERIAL"))
            .andExpect(jsonPath("$.items[0].warrantyStatus").value("PENDING"))
            .andExpect(jsonPath("$.warrantyOverridden").doesNotExist());

        mockMvc.perform(put("/api/rmas/{id}", savedRma.getId())
                .with(asProfile("admin", "ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"purchaseDate":"2025-01-01","purchaseDateUnknown":false,"entryDate":"2026-01-02"}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items[0].warrantyStatus").value("OUT_OF_WARRANTY"))
            .andExpect(jsonPath("$.items[0].warrantyExpiresAt").value("2026-01-01"));
    }

    @Test
    void shouldCalculateEachItemIndependentlyAndIgnoreManualWarrantyFields() throws Exception {
        Client client = new Client();
        client.setLegalName("Warranty client");
        Client savedClient = clientRepository.save(client);
        Product shortProduct = saveProduct("WARRANTY-12", "Twelve months", 12);
        Product longProduct = saveProduct("WARRANTY-24", "Twenty-four months", 24);

        Map<String, Object> payload = Map.of(
            "clientId", savedClient.getId(),
            "items", List.of(
                Map.of("productId", shortProduct.getId(), "serialNumber", "SHORT"),
                Map.of("productId", longProduct.getId(), "serialNumber", "LONG")
            ),
            "purchaseDate", "2025-01-01",
            "entryDate", "2026-07-01",
            "receivedBy", "Service desk",
            "reportedFailure", "Failure",
            "warrantyStatusOverride", "IN_WARRANTY",
            "warrantyJustification", "Obsolete client payload"
        );

        String response = mockMvc.perform(post("/api/rmas")
                .with(asProfile("admin", "ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.items[0].warrantyStatus").value("OUT_OF_WARRANTY"))
            .andExpect(jsonPath("$.items[0].warrantyExpiresAt").value("2026-01-01"))
            .andExpect(jsonPath("$.items[1].warrantyStatus").value("IN_WARRANTY"))
            .andExpect(jsonPath("$.items[1].warrantyExpiresAt").value("2027-01-01"))
            .andExpect(jsonPath("$.warrantyStatus").doesNotExist())
            .andExpect(jsonPath("$.warrantyOverridden").doesNotExist())
            .andExpect(jsonPath("$.warrantyJustification").doesNotExist())
            .andExpect(jsonPath("$.warrantyUpdatedAt").doesNotExist())
            .andReturn().getResponse().getContentAsString();
        long id = objectMapper.readTree(response).get("id").asLong();

        // Changing the catalog must not change the term registered for an existing item.
        shortProduct.setDefaultWarrantyMonths(36);
        productRepository.saveAndFlush(shortProduct);
        mockMvc.perform(get("/api/rmas/{id}", id).with(asProfile("admin", "ADMIN")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items[0].warrantyMonths").value(12))
            .andExpect(jsonPath("$.items[0].warrantyStatus").value("OUT_OF_WARRANTY"))
            .andExpect(jsonPath("$.items[1].warrantyMonths").value(24));

        mockMvc.perform(put("/api/rmas/{id}", id)
                .with(asProfile("admin", "ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"entryDate":"2026-01-01","warrantyStatusOverride":"OUT_OF_WARRANTY","warrantyJustification":"Ignored"}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items[0].warrantyStatus").value("IN_WARRANTY"))
            .andExpect(jsonPath("$.items[1].warrantyStatus").value("IN_WARRANTY"));

        mockMvc.perform(put("/api/rmas/{id}", id)
                .with(asProfile("admin", "ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"purchaseDateUnknown\":true}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items[0].warrantyStatus").value("PENDING"))
            .andExpect(jsonPath("$.items[1].warrantyStatus").value("PENDING"))
            .andExpect(jsonPath("$.items[0].warrantyExpiresAt").doesNotExist())
            .andExpect(jsonPath("$.items[1].warrantyExpiresAt").doesNotExist());
    }

    @Test
    void shouldAssignOnlyActiveTechniciansAndKeepAssignmentHistory() throws Exception {
        Client client = new Client();
        client.setLegalName("Assignment client");
        Client savedClient = clientRepository.save(client);
        Product product = saveProduct("ASSIGNMENT-PRODUCT", "Assignment product", 12);

        RmaRecord rma = new RmaRecord();
        rma.setCode("OS-ASSIGN-0001");
        rma.setClient(savedClient);
        rma.setProduct(product);
        rma.getItemIdentification().setSerialNumber("ASSIGN-SERIAL");
        rma.setPurchaseDateUnknown(true);
        rma.setEntryDate(LocalDate.now(BUSINESS_ZONE));
        rma.setReceivedBy("Service desk");
        rma.setReportedFailure("Assignment test");
        RmaRecord savedRma = rmaRecordRepository.saveAndFlush(rma);

        UserAccount firstTechnician = saveUser("first.tech", "First Technician", "TECHNICIAN", true);
        UserAccount secondTechnician = saveUser("second.tech", "Second Technician", "TECHNICIAN", true);
        UserAccount inactiveTechnician = saveUser("inactive.tech", "Inactive Technician", "TECHNICIAN", false);
        UserAccount serviceUser = saveUser("service.user", "Service User", "SERVICE_DESK", true);

        mockMvc.perform(get("/api/users/assignable")
                .with(asProfile("viewer", "VIEWER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(2)))
            .andExpect(jsonPath("$[0].fullName").value("First Technician"))
            .andExpect(jsonPath("$[1].fullName").value("Second Technician"));

        mockMvc.perform(get("/api/rmas/{id}", savedRma.getId())
                .with(asProfile("admin", "ADMIN")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.assigneeId").doesNotExist());

        mockMvc.perform(patch("/api/rmas/{id}/assignee", savedRma.getId())
                .with(asProfile("service.desk", "SERVICE_DESK"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"assigneeId\":" + firstTechnician.getId() + "}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.assigneeId").value(firstTechnician.getId()))
            .andExpect(jsonPath("$.assigneeName").value("First Technician"))
            .andExpect(jsonPath("$.assignmentHistory", hasSize(1)))
            .andExpect(jsonPath("$.assignmentHistory[0].previousAssigneeId").doesNotExist())
            .andExpect(jsonPath("$.assignmentHistory[0].newAssigneeId").value(firstTechnician.getId()))
            .andExpect(jsonPath("$.assignmentHistory[0].newAssigneeName").value("First Technician"))
            .andExpect(jsonPath("$.assignmentHistory[0].changedBy").value("service.desk"));

        mockMvc.perform(patch("/api/rmas/{id}/assignee", savedRma.getId())
                .with(asProfile("admin", "ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"assigneeId\":" + inactiveTechnician.getId() + "}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Usuários inativos não podem ser responsáveis por uma OS."));

        mockMvc.perform(patch("/api/rmas/{id}/assignee", savedRma.getId())
                .with(asProfile("admin", "ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"assigneeId\":" + serviceUser.getId() + "}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Somente técnicos podem ser responsáveis por uma OS."));

        mockMvc.perform(patch("/api/rmas/{id}/assignee", savedRma.getId())
                .with(asProfile("admin", "ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"assigneeId\":" + secondTechnician.getId() + "}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.assigneeId").value(secondTechnician.getId()))
            .andExpect(jsonPath("$.assignmentHistory", hasSize(2)));

        mockMvc.perform(patch("/api/rmas/{id}/assignee", savedRma.getId())
                .with(asProfile("service.desk", "SERVICE_DESK"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"assigneeId\":null}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.assigneeId").doesNotExist())
            .andExpect(jsonPath("$.assigneeName").doesNotExist())
            .andExpect(jsonPath("$.assignmentHistory", hasSize(3)));

        mockMvc.perform(get("/api/rmas/{id}", savedRma.getId())
                .with(asProfile("admin", "ADMIN")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.assignmentHistory[?(@.previousAssigneeName == 'First Technician' && @.newAssigneeName == 'Second Technician')]", hasSize(1)));
    }

    @Test
    void shouldExposeStagePeriodsAndRestartAfterStageChange() throws Exception {
        Client client = new Client();
        client.setLegalName("Stage client");
        RmaRecord rma = new RmaRecord();
        rma.setCode("OS-STAGE-0001");
        rma.setClient(clientRepository.save(client));
        rma.setProduct(saveProduct("STAGE-PRODUCT", "Stage product", 12));
        rma.getItemIdentification().setSerialNumber("STAGE-SERIAL");
        rma.setPurchaseDateUnknown(true);
        rma.setEntryDate(LocalDate.now(BUSINESS_ZONE));
        rma.setReceivedBy("Service desk");
        rma.setReportedFailure("Stage test");
        RmaStatusHistory history = new RmaStatusHistory();
        history.setStatus(RmaStatus.RECEIVED);
        history.setChangedBy("admin");
        history.setChangedAt(java.time.Instant.parse("2020-01-01T10:00:00Z"));
        rma.addStatusHistory(history);
        Long id = rmaRecordRepository.saveAndFlush(rma).getId();

        mockMvc.perform(get("/api/rmas/{id}", id).with(asProfile("viewer", "VIEWER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.sla").doesNotExist())
            .andExpect(jsonPath("$.stagePeriods", hasSize(1)))
            .andExpect(jsonPath("$.stagePeriods[0].status").value("RECEIVED"))
            .andExpect(jsonPath("$.stagePeriods[0].enteredAt").value("2020-01-01T10:00:00Z"))
            .andExpect(jsonPath("$.stagePeriods[0].leftAt").doesNotExist())
            .andExpect(jsonPath("$.deadline.status").value("NO_DUE_DATE"));
        mockMvc.perform(patch("/api/rmas/{id}/status", id).with(asProfile("tech", "TECHNICIAN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"IN_DIAGNOSIS\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.sla").doesNotExist())
            .andExpect(jsonPath("$.stagePeriods", hasSize(2)))
            .andExpect(jsonPath("$.stagePeriods[0].leftAt").exists())
            .andExpect(jsonPath("$.stagePeriods[1].status").value("IN_DIAGNOSIS"))
            .andExpect(jsonPath("$.stagePeriods[1].leftAt").doesNotExist());
        mockMvc.perform(get("/api/rmas").with(asProfile("viewer", "VIEWER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content[0].stagePeriods[1].status").value("IN_DIAGNOSIS"));
        mockMvc.perform(patch("/api/rmas/{id}/status", id).with(asProfile("tech", "TECHNICIAN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"COMPLETED\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.deadline.status").value("CLOSED"))
            .andExpect(jsonPath("$.deadline.daysUntilDue").doesNotExist())
            .andExpect(jsonPath("$.stagePeriods[2].status").value("COMPLETED"))
            .andExpect(jsonPath("$.sla").doesNotExist());
    }

    @Test
    void shouldExposeDeadlineStatus() throws Exception {
        LocalDate today = LocalDate.now(BUSINESS_ZONE);
        long overdue = createdId(postDueDateRma("DEADLINE-LATE", today.minusDays(5), today.minusDays(1)));
        long soon = createdId(postDueDateRma("DEADLINE-SOON", today, today.plusDays(3)));
        long none = createdId(postDueDateRma("DEADLINE-NONE", today, null));

        mockMvc.perform(get("/api/rmas/{id}", overdue).with(asProfile("viewer", "VIEWER")))
            .andExpect(jsonPath("$.deadline.status").value("OVERDUE"))
            .andExpect(jsonPath("$.deadline.daysUntilDue").value(-1))
            .andExpect(jsonPath("$.deadline.dueSoonFrom").value(today.minusDays(8).toString()));
        mockMvc.perform(get("/api/rmas/{id}", soon).with(asProfile("viewer", "VIEWER")))
            .andExpect(jsonPath("$.deadline.status").value("DUE_SOON"))
            .andExpect(jsonPath("$.deadline.daysUntilDue").value(3));
        mockMvc.perform(get("/api/rmas/{id}", none).with(asProfile("viewer", "VIEWER")))
            .andExpect(jsonPath("$.deadline.status").value("NO_DUE_DATE"))
            .andExpect(jsonPath("$.deadline.dueSoonFrom").doesNotExist());
    }

    @Test
    void shouldRecordPriorityHistoryAndRestrictWhoCanChangeIt() throws Exception {
        Long id = saveTestRma("OS-BULK-PRIORITY");
        mockMvc.perform(put("/api/rmas/{id}", id).with(asProfile("tech", "TECHNICIAN"))
                .with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"priority\":\"HIGH\"}"))
            .andExpect(status().isForbidden());
        mockMvc.perform(put("/api/rmas/{id}", id).with(asProfile("admin", "ADMIN"))
                .with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"priority\":\"HIGH\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.priority").value("HIGH"))
            .andExpect(jsonPath("$.statusHistory[0].note").value("Priority changed from MEDIUM to HIGH"));
    }

    @Test
    void shouldCreateWithOptionalDueDateAndRecordIt() throws Exception {
        LocalDate entry = LocalDate.now(BUSINESS_ZONE);
        String created = postDueDateRma("DUE-CREATE", entry, entry.plusDays(10))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.dueDate").value(entry.plusDays(10).toString()))
            .andExpect(jsonPath("$.dueDateHistory", hasSize(1)))
            .andExpect(jsonPath("$.dueDateHistory[0].previousDueDate").doesNotExist())
            .andExpect(jsonPath("$.dueDateHistory[0].newDueDate").value(entry.plusDays(10).toString()))
            .andExpect(jsonPath("$.dueDateHistory[0].changedBy").value("admin"))
            .andExpect(jsonPath("$.dueDateHistory[0].changedAt").exists())
            .andReturn().getResponse().getContentAsString();
        mockMvc.perform(get("/api/rmas/{id}", objectMapper.readTree(created).get("id").asLong()).with(asProfile("viewer", "VIEWER")))
            .andExpect(jsonPath("$.dueDate").value(entry.plusDays(10).toString()));

        postDueDateRma("DUE-NONE", entry, null)
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.dueDate").doesNotExist())
            .andExpect(jsonPath("$.dueDateHistory", hasSize(0)));
    }

    @Test
    void shouldChangeAndClearDueDateWithHistory() throws Exception {
        LocalDate entry = LocalDate.now(BUSINESS_ZONE);
        LocalDate first = entry.plusDays(5);
        LocalDate second = entry.plusDays(9);
        long id = createdId(postDueDateRma("DUE-EDIT", entry, first));

        putJson(id, "{\"dueDate\":\"" + second + "\"}").andExpect(status().isOk())
            .andExpect(jsonPath("$.dueDate").value(second.toString()))
            .andExpect(jsonPath("$.dueDateHistory", hasSize(2)));
        putJson(id, "{\"dueDate\":\"" + second + "\"}").andExpect(status().isOk())
            .andExpect(jsonPath("$.dueDateHistory", hasSize(2)));
        putJson(id, "{\"invoiceNumber\":\"NF-9\"}").andExpect(status().isOk())
            .andExpect(jsonPath("$.dueDate").value(second.toString()))
            .andExpect(jsonPath("$.dueDateHistory", hasSize(2)));
        putJson(id, "{\"clearDueDate\":true}").andExpect(status().isOk())
            .andExpect(jsonPath("$.dueDate").doesNotExist())
            .andExpect(jsonPath("$.dueDateHistory", hasSize(3)))
            .andExpect(jsonPath("$.dueDateHistory[0].previousDueDate").value(second.toString()))
            .andExpect(jsonPath("$.dueDateHistory[0].newDueDate").doesNotExist())
            .andExpect(jsonPath("$.dueDateHistory[0].changedBy").value("admin"))
            .andExpect(jsonPath("$.dueDateHistory[1].previousDueDate").value(first.toString()))
            .andExpect(jsonPath("$.dueDateHistory[1].newDueDate").value(second.toString()));
        putJson(id, "{\"clearDueDate\":true}").andExpect(status().isOk())
            .andExpect(jsonPath("$.dueDateHistory", hasSize(3)));
    }

    @Test
    void shouldRejectDueDateAndClearTogether() throws Exception {
        LocalDate entry = LocalDate.now(BUSINESS_ZONE);
        long id = createdId(postDueDateRma("DUE-BOTH", entry, null));

        putJson(id, "{\"dueDate\":\"" + entry.plusDays(2) + "\",\"clearDueDate\":true}")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Provide a due date or clear it, not both."));
    }

    @Test
    void shouldRejectDueDateBeforeEntryDate() throws Exception {
        LocalDate entry = LocalDate.now(BUSINESS_ZONE);
        postDueDateRma("DUE-BEFORE", entry, entry.minusDays(1))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Due date cannot be before entry date."));

        long id = createdId(postDueDateRma("DUE-BEFORE-2", entry, null));
        putJson(id, "{\"dueDate\":\"" + entry.minusDays(1) + "\"}")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Due date cannot be before entry date."));
        // A past due date is accepted when it is not before the entry date.
        putJson(id, "{\"entryDate\":\"" + entry.minusDays(20) + "\",\"dueDate\":\"" + entry.minusDays(3) + "\"}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.dueDate").value(entry.minusDays(3).toString()));
    }

    @Test
    void shouldRejectEntryDateAfterExistingDueDate() throws Exception {
        LocalDate entry = LocalDate.now(BUSINESS_ZONE).minusDays(10);
        long id = createdId(postDueDateRma("DUE-ENTRY", entry, entry.plusDays(2)));

        putJson(id, "{\"entryDate\":\"" + entry.plusDays(3) + "\"}")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Due date cannot be before entry date."));
    }

    @Test
    void shouldRequireEditPermissionToChangeDueDate() throws Exception {
        LocalDate entry = LocalDate.now(BUSINESS_ZONE);
        long id = createdId(postDueDateRma("DUE-PERM", entry, null));

        mockMvc.perform(put("/api/rmas/{id}", id).with(asProfile("viewer", "VIEWER")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"dueDate\":\"" + entry.plusDays(1) + "\"}"))
            .andExpect(status().isForbidden());
        assertEquals(null, rmaRecordRepository.findById(id).orElseThrow().getDueDate());
    }

    private org.springframework.test.web.servlet.ResultActions postDueDateRma(String sku, LocalDate entry, LocalDate dueDate) throws Exception {
        Client client = new Client();
        client.setLegalName("Due date client " + sku);
        Client savedClient = clientRepository.save(client);
        Product product = saveProduct(sku, "Due date product", 12);
        Map<String, Object> payload = new java.util.HashMap<>(Map.of(
            "clientId", savedClient.getId(),
            "items", List.of(Map.of("productId", product.getId(), "serialNumber", sku)),
            "purchaseDateUnknown", true,
            "entryDate", entry.toString(),
            "reportedFailure", "Não liga"
        ));
        if (dueDate != null) payload.put("dueDate", dueDate.toString());
        return mockMvc.perform(post("/api/rmas").with(asProfile("admin", "ADMIN")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(payload)));
    }

    private org.springframework.test.web.servlet.ResultActions putJson(long id, String body) throws Exception {
        return mockMvc.perform(put("/api/rmas/{id}", id).with(asProfile("admin", "ADMIN")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private long createdId(org.springframework.test.web.servlet.ResultActions result) throws Exception {
        return objectMapper.readTree(result.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asLong();
    }

    private Long saveTestRma(String code) {
        Client client = new Client();
        client.setLegalName("Bulk test client " + code);
        RmaRecord rma = new RmaRecord();
        rma.setCode(code);
        rma.setClient(clientRepository.save(client));
        rma.setProduct(saveProduct(code, "Bulk test product", 12));
        rma.getItemIdentification().setSerialNumber(code);
        rma.setPurchaseDateUnknown(true);
        rma.setEntryDate(LocalDate.now(BUSINESS_ZONE));
        rma.setReceivedBy("Service desk");
        rma.setReportedFailure("Bulk test");
        return rmaRecordRepository.saveAndFlush(rma).getId();
    }

    @ParameterizedTest
    @ValueSource(strings = { "ADMIN", "SERVICE_DESK" })
    void shouldIgnoreClientSuppliedReceiverAndPreserveOriginalReceiverOnUpdate(String role) throws Exception {
        Client client = new Client();
        client.setLegalName("Receiver audit client");
        Client savedClient = clientRepository.save(client);
        Product product = saveProduct("RECEIVER-PRODUCT", "Receiver product", 12);
        Map<String, Object> payload = Map.of(
            "clientId", savedClient.getId(),
            "items", List.of(Map.of("productId", product.getId(), "serialNumber", "RECEIVER-SERIAL")),
            "purchaseDateUnknown", true,
            "entryDate", LocalDate.now(BUSINESS_ZONE).toString(),
            "invoiceNumber", "  NF-123  ",
            "invoiceFileName", "untrusted.pdf",
            "receivedBy", "Forged receiver",
            "reportedFailure", "Product does not start"
        );

        String response = mockMvc.perform(post("/api/rmas")
                .with(asProfile("original.operator", role))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.receivedBy").value("original.operator"))
            .andExpect(jsonPath("$.invoiceNumber").value("NF-123"))
            .andExpect(jsonPath("$.invoiceFileName").doesNotExist())
            .andReturn().getResponse().getContentAsString();
        long id = objectMapper.readTree(response).get("id").asLong();
        assertEquals("original.operator", rmaRecordRepository.findById(id).orElseThrow().getReceivedBy());
        assertEquals("NF-123", rmaRecordRepository.findById(id).orElseThrow().getInvoiceNumber());

        mockMvc.perform(put("/api/rmas/{id}", id)
                .with(asProfile("another.operator", role))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"invoiceNumber":"NF-456","receivedBy":"Forged update","invoiceFileName":"another.pdf"}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.receivedBy").value("original.operator"))
            .andExpect(jsonPath("$.invoiceNumber").value("NF-456"))
            .andExpect(jsonPath("$.invoiceFileName").doesNotExist());
        assertEquals("original.operator", rmaRecordRepository.findById(id).orElseThrow().getReceivedBy());
        assertEquals("NF-456", rmaRecordRepository.findById(id).orElseThrow().getInvoiceNumber());
    }

    private Product saveProduct(String sku, String name, int warrantyMonths) {
        Product product = new Product();
        product.setSku(sku);
        product.setName(name);
        product.setDefaultWarrantyMonths(warrantyMonths);
        return productRepository.save(product);
    }

    private UserAccount saveUser(String username, String fullName, String role, boolean active) {
        UserAccount user = new UserAccount();
        user.setUsername(username);
        user.setFullName(fullName);
        user.setPasswordHash("not-used-in-this-test");
        AccessTestSupport.assignProfile(accessProfiles, user, role);
        user.setActive(active);
        return userAccountRepository.save(user);
    }
}
