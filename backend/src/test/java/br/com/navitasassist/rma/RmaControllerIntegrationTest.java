package br.com.navitasassist.rma;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.hamcrest.Matchers.hasItem;
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
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.ProductRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.user.UserAccount;
import br.com.navitasassist.user.UserRole;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
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
            "invoiceNumber", "NF-123",
            "reportedFailure", "Products do not start"
        );

        mockMvc.perform(post("/api/rmas")
                .with(user("admin").roles("ADMIN"))
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
    void shouldRejectInconsistentRmaDates() throws Exception {
        Client client = new Client();
        client.setLegalName("Date validation client");
        Client savedClient = clientRepository.save(client);
        Product product = saveProduct("SKU-RMA-DATES", "Date validation product", 12);
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
                .with(user("admin").roles("ADMIN"))
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
                .with(user("admin").roles("ADMIN"))
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
                .with(user("admin").roles("ADMIN"))
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
        Product product = saveProduct("SKU-RMA-LIMIT", "Text limit product", 12);

        Map<String, Object> payload = Map.of(
            "clientId", savedClient.getId(),
            "items", List.of(Map.of("productId", product.getId(), "serialNumber", "LIMIT")),
            "purchaseDateUnknown", true,
            "entryDate", LocalDate.now(BUSINESS_ZONE).toString(),
            "receivedBy", "Service desk",
            "reportedFailure", "x".repeat(1001)
        );

        mockMvc.perform(post("/api/rmas")
                .with(user("admin").roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.details[0]", startsWith("reportedFailure:")));
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
            .andExpect(jsonPath("$.items[0].warrantyStatus").value("IN_WARRANTY"))
            .andExpect(jsonPath("$.items[0].warrantyExpiresAt").value("2027-01-01"))
            .andExpect(jsonPath("$.items[1].warrantyStatus").value("OUT_OF_WARRANTY"))
            .andExpect(jsonPath("$.items[1].warrantyExpiresAt").value("2026-01-01"))
            .andExpect(jsonPath("$.warrantyStatus").doesNotExist());

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
            .andExpect(jsonPath("$.items[0].serialNumber").value("LEGACY-SERIAL"))
            .andExpect(jsonPath("$.items[0].warrantyStatus").value("PENDING"))
            .andExpect(jsonPath("$.warrantyOverridden").doesNotExist());

        mockMvc.perform(put("/api/rmas/{id}", savedRma.getId())
                .with(user("admin").roles("ADMIN"))
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
                .with(user("admin").roles("ADMIN"))
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
        mockMvc.perform(get("/api/rmas/{id}", id).with(user("admin").roles("ADMIN")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items[0].warrantyMonths").value(12))
            .andExpect(jsonPath("$.items[0].warrantyStatus").value("OUT_OF_WARRANTY"))
            .andExpect(jsonPath("$.items[1].warrantyMonths").value(24));

        mockMvc.perform(put("/api/rmas/{id}", id)
                .with(user("admin").roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"entryDate":"2026-01-01","warrantyStatusOverride":"OUT_OF_WARRANTY","warrantyJustification":"Ignored"}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items[0].warrantyStatus").value("IN_WARRANTY"))
            .andExpect(jsonPath("$.items[1].warrantyStatus").value("IN_WARRANTY"));

        mockMvc.perform(put("/api/rmas/{id}", id)
                .with(user("admin").roles("ADMIN"))
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
        rma.setCode("RMA-ASSIGN-0001");
        rma.setClient(savedClient);
        rma.setProduct(product);
        rma.getItemIdentification().setSerialNumber("ASSIGN-SERIAL");
        rma.setPurchaseDateUnknown(true);
        rma.setEntryDate(LocalDate.now(BUSINESS_ZONE));
        rma.setReceivedBy("Service desk");
        rma.setReportedFailure("Assignment test");
        RmaRecord savedRma = rmaRecordRepository.saveAndFlush(rma);

        UserAccount firstTechnician = saveUser("first.tech", "First Technician", UserRole.TECHNICIAN, true);
        UserAccount secondTechnician = saveUser("second.tech", "Second Technician", UserRole.TECHNICIAN, true);
        UserAccount inactiveTechnician = saveUser("inactive.tech", "Inactive Technician", UserRole.TECHNICIAN, false);
        UserAccount serviceUser = saveUser("service.user", "Service User", UserRole.SERVICE_DESK, true);

        mockMvc.perform(get("/api/users/assignable")
                .with(user("viewer").roles("VIEWER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(2)))
            .andExpect(jsonPath("$[0].fullName").value("First Technician"))
            .andExpect(jsonPath("$[1].fullName").value("Second Technician"));

        mockMvc.perform(get("/api/rmas/{id}", savedRma.getId())
                .with(user("admin").roles("ADMIN")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.assigneeId").doesNotExist());

        mockMvc.perform(patch("/api/rmas/{id}/assignee", savedRma.getId())
                .with(user("service.desk").roles("SERVICE_DESK"))
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
                .with(user("admin").roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"assigneeId\":" + inactiveTechnician.getId() + "}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Inactive users cannot be assigned to an RMA."));

        mockMvc.perform(patch("/api/rmas/{id}/assignee", savedRma.getId())
                .with(user("admin").roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"assigneeId\":" + serviceUser.getId() + "}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Only technicians can be assigned to an RMA."));

        mockMvc.perform(patch("/api/rmas/{id}/assignee", savedRma.getId())
                .with(user("admin").roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"assigneeId\":" + secondTechnician.getId() + "}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.assigneeId").value(secondTechnician.getId()))
            .andExpect(jsonPath("$.assignmentHistory", hasSize(2)));

        mockMvc.perform(patch("/api/rmas/{id}/assignee", savedRma.getId())
                .with(user("service.desk").roles("SERVICE_DESK"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"assigneeId\":null}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.assigneeId").doesNotExist())
            .andExpect(jsonPath("$.assigneeName").doesNotExist())
            .andExpect(jsonPath("$.assignmentHistory", hasSize(3)));

        mockMvc.perform(get("/api/rmas/{id}", savedRma.getId())
                .with(user("admin").roles("ADMIN")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.assignmentHistory[?(@.previousAssigneeName == 'First Technician' && @.newAssigneeName == 'Second Technician')]", hasSize(1)));
    }

    @Test
    void shouldExposeSlaAndRestartItAfterPersistedStageChange() throws Exception {
        Client client = new Client();
        client.setLegalName("SLA client");
        RmaRecord rma = new RmaRecord();
        rma.setCode("RMA-SLA-0001");
        rma.setClient(clientRepository.save(client));
        rma.setProduct(saveProduct("SLA-PRODUCT", "SLA product", 12));
        rma.getItemIdentification().setSerialNumber("SLA-SERIAL");
        rma.setPurchaseDateUnknown(true);
        rma.setEntryDate(LocalDate.now(BUSINESS_ZONE));
        rma.setReceivedBy("Service desk");
        rma.setReportedFailure("SLA test");
        RmaStatusHistory history = new RmaStatusHistory();
        history.setStatus(RmaStatus.RECEIVED);
        history.setChangedBy("admin");
        history.setChangedAt(java.time.Instant.parse("2020-01-01T10:00:00Z"));
        rma.addStatusHistory(history);
        Long id = rmaRecordRepository.saveAndFlush(rma).getId();

        mockMvc.perform(get("/api/rmas/{id}", id).with(user("viewer").roles("VIEWER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.sla.status").value("OVERDUE"))
            .andExpect(jsonPath("$.sla.startedAt").value("2020-01-01T10:00:00Z"))
            .andExpect(jsonPath("$.sla.limitSeconds").value(86400));
        mockMvc.perform(patch("/api/rmas/{id}/status", id).with(user("tech").roles("TECHNICIAN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"IN_DIAGNOSIS\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.sla.status").value("NORMAL"))
            .andExpect(jsonPath("$.sla.limitSeconds").value(172800));
        mockMvc.perform(get("/api/rmas").with(user("viewer").roles("VIEWER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].sla.status").value("NORMAL"));
        mockMvc.perform(patch("/api/rmas/{id}/status", id).with(user("tech").roles("TECHNICIAN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"COMPLETED\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.sla.status").value("CLOSED"))
            .andExpect(jsonPath("$.sla.elapsedSeconds").value(0))
            .andExpect(jsonPath("$.sla.dueAt").doesNotExist());
    }

    @Test
    void shouldAllowAnyBulkStageIncludingBackwardMovesAndKeepHistoryPerRma() throws Exception {
        Long firstId = saveBulkTestRma("RMA-BULK-0001");
        Long secondId = saveBulkTestRma("RMA-BULK-0002");
        String nextStage = "{\"status\":\"TRIAGE\",\"expectedStatus\":\"RECEIVED\",\"note\":\"Triagem em lote\"}";

        mockMvc.perform(patch("/api/rmas/{id}/bulk-status", firstId).with(user("tech").roles("TECHNICIAN"))
                .with(csrf()).contentType(MediaType.APPLICATION_JSON).content(nextStage))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("TRIAGE"))
            .andExpect(jsonPath("$.statusHistory[0].note").value("Triagem em lote"));

        mockMvc.perform(patch("/api/rmas/{id}/bulk-status", secondId).with(user("service.desk").roles("SERVICE_DESK"))
                .with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"RETURNED\",\"expectedStatus\":\"RECEIVED\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("RETURNED"));

        mockMvc.perform(patch("/api/rmas/{id}/bulk-status", firstId).with(user("tech").roles("TECHNICIAN"))
                .with(csrf()).contentType(MediaType.APPLICATION_JSON).content(nextStage))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("RMA status changed. Refresh the item before trying again."));

        mockMvc.perform(patch("/api/rmas/{id}/bulk-status", secondId).with(user("tech").roles("TECHNICIAN"))
                .with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"RECEIVED\",\"expectedStatus\":\"RETURNED\",\"note\":\"Corrigido após movimento por engano\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("RECEIVED"))
            .andExpect(jsonPath("$.statusHistory[0].note").value("Corrigido após movimento por engano"));

        mockMvc.perform(get("/api/rmas/{id}", firstId).with(user("viewer").roles("VIEWER")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.statusHistory", hasSize(1)));
        mockMvc.perform(get("/api/rmas/{id}", secondId).with(user("viewer").roles("VIEWER")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("RECEIVED"))
            .andExpect(jsonPath("$.statusHistory", hasSize(2)));

        mockMvc.perform(patch("/api/rmas/{id}/bulk-status", firstId).with(user("viewer").roles("VIEWER"))
                .with(csrf()).contentType(MediaType.APPLICATION_JSON).content(nextStage))
            .andExpect(status().isForbidden());
    }

    @Test
    void shouldRecordPriorityHistoryAndRestrictWhoCanChangeIt() throws Exception {
        Long id = saveBulkTestRma("RMA-BULK-PRIORITY");
        mockMvc.perform(put("/api/rmas/{id}", id).with(user("tech").roles("TECHNICIAN"))
                .with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"priority\":\"HIGH\"}"))
            .andExpect(status().isForbidden());
        mockMvc.perform(put("/api/rmas/{id}", id).with(user("admin").roles("ADMIN"))
                .with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"priority\":\"HIGH\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.priority").value("HIGH"))
            .andExpect(jsonPath("$.statusHistory[0].note").value("Priority changed from MEDIUM to HIGH"));
    }

    private Long saveBulkTestRma(String code) {
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
                .with(user("original.operator").roles(role))
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
                .with(user("another.operator").roles(role))
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


    @ParameterizedTest
    @CsvSource({ "ADMIN,false", "ADMIN,true", "SERVICE_DESK,false", "SERVICE_DESK,true" })
    void shouldAcceptOptionalAndMaximumInvoiceNumbers(String role, boolean maximum) throws Exception {
        String invoiceNumber = maximum ? "n".repeat(80) : null;
        var created = mockMvc.perform(post("/api/rmas").with(user("operator").roles(role)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(invoiceRmaPayload(invoiceNumber))))
            .andExpect(status().isCreated()).andReturn();
        Long id = objectMapper.readTree(created.getResponse().getContentAsString()).get("id").asLong();

        var persisted = mockMvc.perform(get("/api/rmas/{id}", id).with(user("viewer").roles("VIEWER")))
            .andExpect(status().isOk());
        if (maximum) persisted.andExpect(jsonPath("$.invoiceNumber").value(invoiceNumber));
        else persisted.andExpect(jsonPath("$.invoiceNumber").doesNotExist());

        String updated = "u".repeat(80);
        mockMvc.perform(put("/api/rmas/{id}", id).with(user("operator").roles(role)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("invoiceNumber", updated))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.invoiceNumber").value(updated));
        mockMvc.perform(get("/api/rmas/{id}", id).with(user("viewer").roles("VIEWER")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.invoiceNumber").value(updated));

        mockMvc.perform(put("/api/rmas/{id}", id).with(user("operator").roles(role)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"invoiceNumber\":\"\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.invoiceNumber").doesNotExist());
        mockMvc.perform(get("/api/rmas/{id}", id).with(user("viewer").roles("VIEWER")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.invoiceNumber").doesNotExist());
    }

    @ParameterizedTest
    @ValueSource(strings = { "ADMIN", "SERVICE_DESK" })
    void shouldRejectOversizedInvoiceWithoutCreatingOrChangingRma(String role) throws Exception {
        Map<String, Object> payload = invoiceRmaPayload("n".repeat(81));
        long count = rmaRecordRepository.count();
        mockMvc.perform(post("/api/rmas").with(user("operator").roles(role)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(payload)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.details").value(hasItem(startsWith("invoiceNumber:"))));
        assertEquals(count, rmaRecordRepository.count());

        payload.put("invoiceNumber", "Original NF");
        var created = mockMvc.perform(post("/api/rmas").with(user("operator").roles(role)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(payload)))
            .andExpect(status().isCreated()).andReturn();
        Long id = objectMapper.readTree(created.getResponse().getContentAsString()).get("id").asLong();
        mockMvc.perform(put("/api/rmas/{id}", id).with(user("operator").roles(role)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "invoiceNumber", "n".repeat(81), "reportedFailure", "Overwritten failure"))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.details").value(hasItem(startsWith("invoiceNumber:"))));
        mockMvc.perform(get("/api/rmas/{id}", id).with(user("viewer").roles("VIEWER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.invoiceNumber").value("Original NF"))
            .andExpect(jsonPath("$.reportedFailure").value("Original failure"));
    }

    @ParameterizedTest
    @ValueSource(strings = { "VIEWER", "TECHNICIAN" })
    void shouldKeepInvoiceCreationAndUpdatesRestricted(String role) throws Exception {
        Long id = saveBulkTestRma("RMA-INVOICE-1");
        long count = rmaRecordRepository.count();
        mockMvc.perform(post("/api/rmas").with(user("operator").roles(role)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(invoiceRmaPayload("NF-123"))))
            .andExpect(status().isForbidden());
        mockMvc.perform(put("/api/rmas/{id}", id).with(user("operator").roles(role)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"invoiceNumber\":\"NF-123\"}"))
            .andExpect(status().isForbidden());
        assertEquals(count, rmaRecordRepository.count());
        mockMvc.perform(get("/api/rmas/{id}", id).with(user("viewer").roles("VIEWER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.invoiceNumber").doesNotExist())
            .andExpect(jsonPath("$.reportedFailure").value("Bulk test"));
    }

    private Map<String, Object> invoiceRmaPayload(String invoiceNumber) {
        Client client = new Client();
        client.setLegalName("Invoice test client");
        Product product = saveProduct("SKU-INVOICE-1", "Invoice test product", 12);
        Map<String, Object> payload = new HashMap<>(Map.of(
            "clientId", clientRepository.save(client).getId(),
            "items", List.of(Map.of("productId", product.getId(), "serialNumber", "SER-INVOICE-1")),
            "purchaseDateUnknown", true, "entryDate", LocalDate.now(BUSINESS_ZONE).toString(),
            "reportedFailure", "Original failure"
        ));
        if (invoiceNumber != null) payload.put("invoiceNumber", invoiceNumber);
        return payload;
    }

    private Product saveProduct(String sku, String name, int warrantyMonths) {
        Product product = new Product();
        product.setSku(sku);
        product.setName(name);
        product.setDefaultWarrantyMonths(warrantyMonths);
        return productRepository.save(product);
    }

    private UserAccount saveUser(String username, String fullName, UserRole role, boolean active) {
        UserAccount user = new UserAccount();
        user.setUsername(username);
        user.setFullName(fullName);
        user.setPasswordHash("not-used-in-this-test");
        user.setRole(role);
        user.setActive(active);
        return userAccountRepository.save(user);
    }
}
