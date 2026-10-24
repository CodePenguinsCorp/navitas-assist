package br.com.navitasassist.custody;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.Map;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.ProductRepository;
import br.com.navitasassist.repository.RmaCustodyMovementRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.repository.StorageLocationRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.rma.RmaStatus;
import br.com.navitasassist.user.UserAccount;
import br.com.navitasassist.user.UserRole;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CustodyControllerIntegrationTest {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Sao_Paulo");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ClientRepository clientRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private RmaRecordRepository rmaRecordRepository;

    @Autowired
    private UserAccountRepository userAccountRepository;

    @Autowired
    private StorageLocationRepository storageLocationRepository;

    @Autowired
    private RmaCustodyMovementRepository rmaCustodyMovementRepository;

    private UserAccount technician;

    @BeforeEach
    void prepareData() {
        cleanData();
        technician = saveUser("custody.tech", "Técnica Custódia", UserRole.TECHNICIAN);
        saveUser("custody.viewer", "Visualizador Custódia", UserRole.VIEWER);
    }

    @AfterEach
    void cleanData() {
        rmaCustodyMovementRepository.deleteAll();
        jdbcTemplate.update("UPDATE storage_locations SET parent_id = NULL");
        storageLocationRepository.deleteAll();
        rmaRecordRepository.deleteAll();
        productRepository.deleteAll();
        clientRepository.deleteAll();
        userAccountRepository.findByUsernameIgnoreCase("custody.tech").ifPresent(userAccountRepository::delete);
        userAccountRepository.findByUsernameIgnoreCase("custody.viewer").ifPresent(userAccountRepository::delete);
    }

    @Test
    void shouldManageLocationsOnlyWithCatalogRoles() throws Exception {
        long areaId = createLocation("AREA-REP", "Área de reparo", "AREA", null);

        mockMvc.perform(post("/api/locations")
                .with(user("custody.tech").roles("TECHNICIAN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(locationJson("BANC-01", "Bancada 1", "BENCH", areaId, true)))
            .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/locations")
                .with(user("admin").roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(locationJson(" area-rep ", "Duplicada", "AREA", null, true)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Location code already registered: AREA-REP"));

        mockMvc.perform(put("/api/locations/{id}", areaId)
                .with(user("admin").roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(locationJson("AREA-REP", "Área de reparo", "AREA", areaId, true)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("A location cannot be its own parent."));

        long benchId = createLocation("banc-01", "Bancada 1", "BENCH", areaId);

        mockMvc.perform(get("/api/locations").with(user("custody.viewer").roles("VIEWER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(2)))
            .andExpect(jsonPath("$[0].code").value("AREA-REP"))
            .andExpect(jsonPath("$[1].code").value("BANC-01"))
            .andExpect(jsonPath("$[1].parentId").value(areaId))
            .andExpect(jsonPath("$[1].parentName").value("Área de reparo"))
            .andExpect(jsonPath("$[1].active").value(true));

        mockMvc.perform(put("/api/locations/{id}", areaId)
                .with(user("admin").roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(locationJson("AREA-REP", "Área de reparo", "AREA", benchId, true)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("A location cannot be placed inside one of its own sublocations."));
    }

    @Test
    void shouldRecordEntryAndTransferWithOriginDestinationOperatorAndTime() throws Exception {
        long areaId = createLocation("AREA-TRI", "Triagem", "AREA", null);
        long benchId = createLocation("BANC-02", "Bancada 2", "BENCH", areaId);
        long shelfId = createLocation("PRAT-01", "Prateleira 1", "SHELF", null);
        Long rmaId = saveRma("RMA-CUST-1", RmaStatus.TRIAGE);
        Instant beforeMove = Instant.now().minusSeconds(1);

        move(rmaId, "custody.tech", "TECHNICIAN", "ENTRY", benchId, null, "Recebido na bancada")
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.current.locationId").value(benchId))
            .andExpect(jsonPath("$.current.custodianName").value("Técnica Custódia"))
            .andExpect(jsonPath("$.current.flag").value("OK"));

        move(rmaId, "admin", "ADMIN", "TRANSFER", shelfId, technician.getId(), "Aguardando peça")
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.current.locationId").value(shelfId))
            .andExpect(jsonPath("$.current.locationName").value("Prateleira 1"))
            .andExpect(jsonPath("$.current.custodianId").value(technician.getId()))
            .andExpect(jsonPath("$.movements", hasSize(2)))
            .andExpect(jsonPath("$.movements[0].type").value("TRANSFER"))
            .andExpect(jsonPath("$.movements[0].fromLocationId").value(benchId))
            .andExpect(jsonPath("$.movements[0].fromLocationName").value("Bancada 2"))
            .andExpect(jsonPath("$.movements[0].toLocationId").value(shelfId))
            .andExpect(jsonPath("$.movements[0].performedBy").value("admin"))
            .andExpect(jsonPath("$.movements[0].performedAt", notNullValue()))
            .andExpect(jsonPath("$.movements[0].reason").value("Aguardando peça"))
            .andExpect(jsonPath("$.movements[1].type").value("ENTRY"))
            .andExpect(jsonPath("$.movements[1].fromLocationId").doesNotExist())
            .andExpect(jsonPath("$.movements[1].performedBy").value("custody.tech"));

        Instant performedAt = rmaCustodyMovementRepository.findAllByRma_IdOrderByPerformedAtDescIdDesc(rmaId).get(0).getPerformedAt();
        assertEquals(true, !performedAt.isBefore(beforeMove) && !performedAt.isAfter(Instant.now()));

        move(rmaId, "admin", "ADMIN", "TRANSFER", shelfId, null, null)
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("The equipment is already in this location."));

        move(rmaId, "admin", "ADMIN", "ENTRY", benchId, null, null)
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("The equipment already has a location. Use a transfer instead."));
    }

    @Test
    void shouldRejectMovementsToInactiveLocationsAndKeepOccupiedLocationsActive() throws Exception {
        long activeId = createLocation("QUAR-01", "Quarentena", "QUARANTINE", null);
        long inactiveId = createLocation("EXP-01", "Expedição antiga", "SHIPPING", null);
        updateLocation(inactiveId, "EXP-01", "Expedição antiga", "SHIPPING", null, false).andExpect(status().isOk());
        Long rmaId = saveRma("RMA-CUST-2", RmaStatus.RECEIVED);

        move(rmaId, "admin", "ADMIN", "ENTRY", inactiveId, null, null)
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Inactive locations cannot receive equipment."));

        move(rmaId, "admin", "ADMIN", "ENTRY", activeId, null, null).andExpect(status().isCreated());

        updateLocation(activeId, "QUAR-01", "Quarentena", "QUARANTINE", null, false)
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("A location holding equipment cannot be deactivated."));

        long areaId = createLocation("AREA-QUAR", "Área de quarentena", "AREA", null);
        updateLocation(activeId, "QUAR-01", "Quarentena", "QUARANTINE", areaId, true).andExpect(status().isOk());
        updateLocation(areaId, "AREA-QUAR", "Área de quarentena", "AREA", null, false)
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("A location holding equipment cannot be deactivated."));
    }

    @Test
    void shouldEnforceMovementPermissionsAndKeepHistoryImmutable() throws Exception {
        long benchId = createLocation("BANC-03", "Bancada 3", "BENCH", null);
        Long rmaId = saveRma("RMA-CUST-3", RmaStatus.IN_REPAIR);

        move(rmaId, "custody.viewer", "VIEWER", "ENTRY", benchId, null, null).andExpect(status().isForbidden());
        move(rmaId, "custody.tech", "TECHNICIAN", "ENTRY", benchId, null, null).andExpect(status().isCreated());
        Long movementId = rmaCustodyMovementRepository.findAllByRma_IdOrderByPerformedAtDescIdDesc(rmaId).get(0).getId();

        mockMvc.perform(delete("/api/custody/rmas/{rmaId}/movements/{id}", rmaId, movementId)
                .with(user("custody.tech").roles("TECHNICIAN"))
                .with(csrf()))
            .andExpect(status().isForbidden());

        mockMvc.perform(delete("/api/custody/rmas/{rmaId}/movements", rmaId)
                .with(user("custody.tech").roles("SERVICE_DESK"))
                .with(csrf()))
            .andExpect(status().isForbidden());

        mockMvc.perform(put("/api/custody/rmas/{rmaId}/movements/{id}", rmaId, movementId)
                .with(user("custody.tech").roles("TECHNICIAN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isForbidden());

        assertEquals(1, rmaCustodyMovementRepository.findAllByRma_IdOrderByPerformedAtDescIdDesc(rmaId).size());

        mockMvc.perform(post("/api/custody/rmas/{rmaId}/movements", rmaId)
                .with(user("custody.tech").roles("TECHNICIAN"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(movementJson("TRANSFER", benchId, null, null)))
            .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/custody/rmas/{rmaId}", rmaId).with(user("custody.viewer").roles("VIEWER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.movements", hasSize(1)));
    }

    @Test
    void shouldAllowExitOnlyForFinishedRmasAndRequireValidCustodian() throws Exception {
        long shippingId = createLocation("EXP-02", "Expedição", "SHIPPING", null);
        Long activeRmaId = saveRma("RMA-CUST-4", RmaStatus.IN_TESTS);
        Long finishedRmaId = saveRma("RMA-CUST-5", RmaStatus.COMPLETED);
        UserAccount viewer = userAccountRepository.findByUsernameIgnoreCase("custody.viewer").orElseThrow();

        move(activeRmaId, "admin", "ADMIN", "ENTRY", shippingId, viewer.getId(), null)
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Viewers cannot take custody of equipment."));

        move(activeRmaId, "admin", "ADMIN", "ENTRY", shippingId, null, null).andExpect(status().isCreated());
        move(activeRmaId, "admin", "ADMIN", "EXIT", null, null, "Saída")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Only finished RMAs can leave internal custody."));

        move(finishedRmaId, "admin", "ADMIN", "EXIT", null, null, null)
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("The equipment has no current location."));

        move(finishedRmaId, "admin", "ADMIN", "ENTRY", shippingId, null, null).andExpect(status().isCreated());
        move(finishedRmaId, "admin", "ADMIN", "EXIT", null, null, "Enviado ao cliente")
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.current.locationId").doesNotExist())
            .andExpect(jsonPath("$.current.custodianId").doesNotExist())
            .andExpect(jsonPath("$.movements[0].type").value("EXIT"))
            .andExpect(jsonPath("$.movements[0].fromLocationId").value(shippingId));
    }

    @Test
    void shouldFindEquipmentByAreaAndFlagMissingOrStaleLocations() throws Exception {
        long areaId = createLocation("AREA-LAB", "Laboratório", "AREA", null);
        long benchId = createLocation("BANC-04", "Bancada 4", "BENCH", areaId);
        long otherId = createLocation("PRAT-02", "Prateleira 2", "SHELF", null);
        Long inBenchId = saveRma("RMA-CUST-6", RmaStatus.IN_DIAGNOSIS);
        Long inAreaId = saveRma("RMA-CUST-7", RmaStatus.TRIAGE);
        Long elsewhereId = saveRma("RMA-CUST-8", RmaStatus.TRIAGE);
        Long missingId = saveRma("RMA-CUST-9", RmaStatus.RECEIVED);
        saveRma("RMA-CUST-10", RmaStatus.RETURNED);

        move(inBenchId, "admin", "ADMIN", "ENTRY", benchId, null, null).andExpect(status().isCreated());
        move(inAreaId, "admin", "ADMIN", "ENTRY", areaId, null, null).andExpect(status().isCreated());
        move(elsewhereId, "admin", "ADMIN", "ENTRY", otherId, null, null).andExpect(status().isCreated());
        jdbcTemplate.update("UPDATE rma_custody_movements SET performed_at = ? WHERE rma_id = ?",
            java.sql.Timestamp.from(Instant.now().minus(3, ChronoUnit.DAYS)), elsewhereId);

        mockMvc.perform(get("/api/custody").param("locationId", String.valueOf(areaId)).with(user("custody.viewer").roles("VIEWER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(2)))
            .andExpect(jsonPath("$[0].rmaCode").value("RMA-CUST-6"))
            .andExpect(jsonPath("$[0].locationName").value("Bancada 4"))
            .andExpect(jsonPath("$[1].rmaCode").value("RMA-CUST-7"));

        mockMvc.perform(get("/api/custody").with(user("custody.viewer").roles("VIEWER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(4)));

        mockMvc.perform(get("/api/custody").param("flag", "MISSING").with(user("custody.viewer").roles("VIEWER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].rmaId").value(missingId))
            .andExpect(jsonPath("$[0].locationId").doesNotExist());

        mockMvc.perform(get("/api/custody").param("flag", "STALE").with(user("custody.viewer").roles("VIEWER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].rmaId").value(elsewhereId));
    }

    @Test
    void shouldListOnlyActiveNonViewerUsersAsCustodians() throws Exception {
        UserAccount inactive = saveUser("custody.inactive", "Inativo", UserRole.SERVICE_DESK);
        inactive.setActive(false);
        userAccountRepository.save(inactive);

        try {
            mockMvc.perform(get("/api/custody/custodians").with(user("custody.tech").roles("TECHNICIAN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.username == 'custody.tech')]", hasSize(1)))
                .andExpect(jsonPath("$[?(@.username == 'custody.viewer')]", hasSize(0)))
                .andExpect(jsonPath("$[?(@.username == 'custody.inactive')]", hasSize(0)));
        } finally {
            userAccountRepository.delete(inactive);
        }
    }

    private long createLocation(String code, String name, String type, Long parentId) throws Exception {
        String response = mockMvc.perform(post("/api/locations")
                .with(user("admin").roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(locationJson(code, name, type, parentId, true)))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response).get("id").asLong();
    }

    private org.springframework.test.web.servlet.ResultActions updateLocation(long id, String code, String name, String type, Long parentId, boolean active) throws Exception {
        return mockMvc.perform(put("/api/locations/{id}", id)
            .with(user("admin").roles("ADMIN"))
            .with(csrf())
            .contentType(MediaType.APPLICATION_JSON)
            .content(locationJson(code, name, type, parentId, active)));
    }

    private org.springframework.test.web.servlet.ResultActions move(Long rmaId, String username, String role, String type, Long toLocationId, Long custodianId, String reason) throws Exception {
        return mockMvc.perform(post("/api/custody/rmas/{rmaId}/movements", rmaId)
            .with(user(username).roles(role))
            .with(csrf())
            .contentType(MediaType.APPLICATION_JSON)
            .content(movementJson(type, toLocationId, custodianId, reason)));
    }

    private String locationJson(String code, String name, String type, Long parentId, boolean active) throws Exception {
        Map<String, Object> payload = new HashMap<>();
        payload.put("code", code);
        payload.put("name", name);
        payload.put("type", type);
        payload.put("parentId", parentId);
        payload.put("active", active);
        return objectMapper.writeValueAsString(payload);
    }

    private String movementJson(String type, Long toLocationId, Long custodianId, String reason) throws Exception {
        Map<String, Object> payload = new HashMap<>();
        payload.put("type", type);
        payload.put("toLocationId", toLocationId);
        payload.put("custodianId", custodianId);
        payload.put("reason", reason);
        return objectMapper.writeValueAsString(payload);
    }

    private Long saveRma(String code, RmaStatus status) {
        Client client = new Client();
        client.setLegalName("Cliente " + code);
        Product product = new Product();
        product.setSku(code);
        product.setName("Produto " + code);
        product.setDefaultWarrantyMonths(12);
        RmaRecord rma = new RmaRecord();
        rma.setCode(code);
        rma.setClient(clientRepository.save(client));
        rma.setProduct(productRepository.save(product));
        rma.getItemIdentification().setSerialNumber(code);
        rma.setPurchaseDateUnknown(true);
        rma.setEntryDate(LocalDate.now(BUSINESS_ZONE));
        rma.setReceivedBy("Service desk");
        rma.setReportedFailure("Custody test");
        rma.setStatus(status);
        return rmaRecordRepository.saveAndFlush(rma).getId();
    }

    private UserAccount saveUser(String username, String fullName, UserRole role) {
        UserAccount account = new UserAccount();
        account.setUsername(username);
        account.setFullName(fullName);
        account.setPasswordHash("not-used-in-this-test");
        account.setRole(role);
        account.setActive(true);
        return userAccountRepository.save(account);
    }
}
