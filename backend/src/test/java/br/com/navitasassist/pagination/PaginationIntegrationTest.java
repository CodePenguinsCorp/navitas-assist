package br.com.navitasassist.pagination;

import static br.com.navitasassist.access.AccessTestSupport.asProfile;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.Set;

import br.com.navitasassist.access.AccessProfile;
import br.com.navitasassist.access.AccessTestSupport;
import br.com.navitasassist.repository.AccessProfileRepository;
import br.com.navitasassist.client.Client;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.ProductRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.rma.RmaItem;
import br.com.navitasassist.rma.RmaPriority;
import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.rma.RmaStatus;
import br.com.navitasassist.rma.RmaStatusHistory;
import br.com.navitasassist.user.UserAccount;
import br.com.navitasassist.user.UserAccountTestSupport;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PaginationIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

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

    @Autowired
    private PasswordEncoder passwordEncoder;

    private static final String CUSTOM_PROFILE = "Teste paginacao gestor";
    private static final String OTHER_PROFILE = "Teste paginacao personalizado";

    @AfterEach
    void cleanCustomProfiles() {
        userAccountRepository.findAll().stream()
            .filter(account -> account.getProfile().getLegacyCode() == null)
            .forEach(userAccountRepository::delete);
        userAccountRepository.flush();
        AccessTestSupport.deleteProfiles(accessProfiles, CUSTOM_PROFILE, OTHER_PROFILE);
    }

    @BeforeEach
    void clean() {
        rmaRecordRepository.deleteAll();
        productRepository.deleteAll();
        clientRepository.deleteAll();
        userAccountRepository.findAll().stream()
            .filter(account -> !account.getUsername().equalsIgnoreCase("admin"))
            .forEach(userAccountRepository::delete);
        UserAccountTestSupport.ensureAdmin(userAccountRepository, accessProfiles, passwordEncoder);
    }

    @Test
    void shouldPageClientsWithMetadataAndStableOrder() throws Exception {
        for (String name : new String[] {"Delta", "alpha", "Charlie", "Bravo", "Echo"}) {
            saveClient(name, null, null);
        }

        mockMvc.perform(get("/api/clients").param("page", "0").param("size", "2").with(admin()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content", hasSize(2)))
            .andExpect(jsonPath("$.content[*].legalName", contains("alpha", "Bravo")))
            .andExpect(jsonPath("$.page").value(0))
            .andExpect(jsonPath("$.size").value(2))
            .andExpect(jsonPath("$.totalElements").value(5))
            .andExpect(jsonPath("$.totalPages").value(3));

        mockMvc.perform(get("/api/clients").param("page", "2").param("size", "2").with(admin()))
            .andExpect(jsonPath("$.content[*].legalName", contains("Echo")));

        mockMvc.perform(get("/api/clients").param("page", "9").param("size", "2").with(admin()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content", hasSize(0)))
            .andExpect(jsonPath("$.totalElements").value(5));
    }

    @Test
    void shouldApplyDefaultPageSizeWhenOmitted() throws Exception {
        for (int index = 0; index < 25; index++) {
            saveClient(String.format("Client %02d", index), null, null);
        }

        mockMvc.perform(get("/api/clients").with(admin()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content", hasSize(PageParams.DEFAULT_SIZE)))
            .andExpect(jsonPath("$.size").value(PageParams.DEFAULT_SIZE))
            .andExpect(jsonPath("$.totalElements").value(25))
            .andExpect(jsonPath("$.totalPages").value(2));
    }

    @Test
    void shouldFilterClientsAcrossPages() throws Exception {
        saveClient("Acme One", "11.111.111/0001-11", "one@acme.com");
        saveClient("Acme Two", null, "two@acme.com");
        saveClient("Acme Three", "33.333.333/0001-33", null);
        saveClient("Other", "44.444.444/0001-44", "other@other.com");

        mockMvc.perform(get("/api/clients").param("query", "ACME").param("size", "2").with(admin()))
            .andExpect(jsonPath("$.totalElements").value(3))
            .andExpect(jsonPath("$.totalPages").value(2))
            .andExpect(jsonPath("$.content[*].legalName", contains("Acme One", "Acme Three")));

        mockMvc.perform(get("/api/clients").param("query", "acme").param("hasDocument", "true").with(admin()))
            .andExpect(jsonPath("$.content[*].legalName", contains("Acme One", "Acme Three")));

        mockMvc.perform(get("/api/clients").param("hasEmail", "false").with(admin()))
            .andExpect(jsonPath("$.content[*].legalName", contains("Acme Three")));

        mockMvc.perform(get("/api/clients").param("hasDocument", "false").param("hasEmail", "true").with(admin()))
            .andExpect(jsonPath("$.content[*].legalName", contains("Acme Two")));
    }

    @Test
    void shouldRejectInvalidPaginationParameters() throws Exception {
        mockMvc.perform(get("/api/clients").param("page", "-1").with(admin()))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Page must be greater than or equal to 0."));
        mockMvc.perform(get("/api/clients").param("size", "0").with(admin()))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Size must be between 1 and 100."));
        mockMvc.perform(get("/api/products").param("size", "101").with(admin()))
            .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/users").param("page", "abc").with(admin()))
            .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/rmas").param("size", "1000").with(admin()))
            .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/users").param("profileId", "abc").with(admin()))
            .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/clients").param("size", "100").with(admin()))
            .andExpect(status().isOk());
    }

    @Test
    void shouldSummarizeClientsAcrossAllPages() throws Exception {
        saveClient("A", "doc", "a@a.com");
        saveClient("B", null, "b@b.com");
        Client withContact = saveClient("C", null, null);
        withContact.setPhone("(47) 99999-0000");
        clientRepository.save(withContact);

        mockMvc.perform(get("/api/clients/summary").with(admin()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.total").value(3))
            .andExpect(jsonPath("$.withContact").doesNotExist())
            .andExpect(jsonPath("$.withDocument").doesNotExist())
            .andExpect(jsonPath("$.withEmail").doesNotExist());
    }

    @Test
    void shouldListAllClientsAndProductsForSelectors() throws Exception {
        for (int index = 0; index < 130; index++) {
            saveClient(String.format("Client %03d", index), null, null);
            saveProduct(String.format("SKU-%03d", index), String.format("Product %03d", index), null, null);
        }

        mockMvc.perform(get("/api/clients/options").with(admin()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(130)))
            .andExpect(jsonPath("$[0].legalName").value("Client 000"));
        mockMvc.perform(get("/api/products/options").with(admin()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(130)))
            .andExpect(jsonPath("$[129].name").value("Product 129"));
    }

    @Test
    void shouldFilterAndSummarizeProducts() throws Exception {
        saveProduct("SKU-1", "Router", "Network", "1.0");
        saveProduct("SKU-2", "Switch", "network", null);
        saveProduct("SKU-3", "Camera", "Video", "2.0");
        saveProduct("SKU-4", "Cable", null, null);

        mockMvc.perform(get("/api/products").param("category", "NETWORK").with(admin()))
            .andExpect(jsonPath("$.totalElements").value(2))
            .andExpect(jsonPath("$.content[*].name", contains("Router", "Switch")));
        mockMvc.perform(get("/api/products").param("hasFirmware", "true").param("size", "1").with(admin()))
            .andExpect(jsonPath("$.totalElements").value(2))
            .andExpect(jsonPath("$.totalPages").value(2))
            .andExpect(jsonPath("$.content[*].name", contains("Camera")));
        mockMvc.perform(get("/api/products").param("query", "sw").param("hasFirmware", "false").with(admin()))
            .andExpect(jsonPath("$.content[*].name", contains("Switch")));

        mockMvc.perform(get("/api/products/summary").with(admin()))
            .andExpect(jsonPath("$.total").value(4))
            .andExpect(jsonPath("$.withFirmware").doesNotExist())
            .andExpect(jsonPath("$.averageWarrantyMonths").doesNotExist())
            .andExpect(jsonPath("$.categories", contains("Network", "Video")));
    }

    @Test
    void shouldFilterAndSummarizeUsers() throws Exception {
        saveUser("zoe", "Zoe Admin", "ADMIN", true);
        saveUser("ana", "Ana Tech", "TECHNICIAN", true);
        saveUser("bob", "Bob Tech", "TECHNICIAN", false);

        mockMvc.perform(get("/api/users").param("profileId", profileId("TECHNICIAN").toString()).param("size", "1").with(admin()))
            .andExpect(jsonPath("$.totalElements").value(2))
            .andExpect(jsonPath("$.totalPages").value(2))
            .andExpect(jsonPath("$.content[*].username", contains("ana")));
        mockMvc.perform(get("/api/users").param("active", "false").with(admin()))
            .andExpect(jsonPath("$.content[*].username", contains("bob")));
        mockMvc.perform(get("/api/users").param("query", "ZOE").with(admin()))
            .andExpect(jsonPath("$.content[*].username", contains("zoe")));

        mockMvc.perform(get("/api/users/summary").with(admin()))
            .andExpect(jsonPath("$.total").value(4))
            .andExpect(jsonPath("$.active").doesNotExist())
            .andExpect(jsonPath("$.admins").doesNotExist())
            .andExpect(jsonPath("$.roles").doesNotExist());
    }

    /** Perfis personalizados entram no filtro e no resumo pelo perfil e pelas permissões efetivas (D13). */
    @Test
    void shouldFilterAndSummarizeUsersByCustomProfileAndEffectivePermissions() throws Exception {
        AccessProfile manager = AccessTestSupport.saveProfile(accessProfiles, CUSTOM_PROFILE, "usuarios.gerir", "perfis.gerir");
        AccessProfile custom = AccessTestSupport.saveProfile(accessProfiles, OTHER_PROFILE, "rma.ver");
        saveUser("carl", "Carl Custom Admin", manager, Set.of(), true);
        saveUser("dora", "Dora Custom Inactive Admin", custom, Set.of("usuarios.gerir", "perfis.gerir"), false);
        saveUser("eve", "Eve Custom", custom, Set.of("usuarios.gerir"), true);
        saveUser("finn", "Finn Viewer", accessProfiles.findByLegacyCode("VIEWER").orElseThrow(), Set.of(), true);

        mockMvc.perform(get("/api/users").param("profileId", custom.getId().toString()).with(admin()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalElements").value(2))
            .andExpect(jsonPath("$.content[*].username", contains("dora", "eve")));
        mockMvc.perform(get("/api/users").param("profileId", manager.getId().toString()).with(admin()))
            .andExpect(jsonPath("$.content[*].username", contains("carl")));
        mockMvc.perform(get("/api/users").param("profileId", profileId("VIEWER").toString()).with(admin()))
            .andExpect(jsonPath("$.content[*].username", contains("finn")));

        mockMvc.perform(get("/api/users/summary").with(admin()))
            .andExpect(jsonPath("$.total").value(5))
            .andExpect(jsonPath("$.active").doesNotExist())
            .andExpect(jsonPath("$.admins").doesNotExist())
            .andExpect(jsonPath("$.roles").doesNotExist());
    }

    @Test
    void shouldPageRmasWithFiltersAndKeepFullBoardList() throws Exception {
        Client client = saveClient("OS Client", null, null);
        Product product = saveProduct("SKU-PAGE", "Paged product", null, null);

        for (int index = 1; index <= 5; index++) {
            saveRma(client, product, "OS-2026-000" + index, index == 5 ? RmaStatus.IN_REPAIR : RmaStatus.RECEIVED, index);
        }

        mockMvc.perform(get("/api/rmas").param("size", "2").with(admin()))
            .andExpect(jsonPath("$.content[*].code", contains("OS-2026-0001", "OS-2026-0002")))
            .andExpect(jsonPath("$.totalElements").value(5))
            .andExpect(jsonPath("$.totalPages").value(3));
        mockMvc.perform(get("/api/rmas").param("size", "2").param("page", "1").with(admin()))
            .andExpect(jsonPath("$.content[*].code", contains("OS-2026-0003", "OS-2026-0004")));
        mockMvc.perform(get("/api/rmas").param("status", "RECEIVED").param("size", "3").with(admin()))
            .andExpect(jsonPath("$.totalElements").value(4))
            .andExpect(jsonPath("$.totalPages").value(2));
        mockMvc.perform(get("/api/rmas").param("query", "paged").param("status", "IN_REPAIR").with(admin()))
            .andExpect(jsonPath("$.content[*].code", contains("OS-2026-0005")));
        mockMvc.perform(get("/api/rmas/board").with(admin()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(5)));
        mockMvc.perform(get("/api/rmas/board").param("status", "IN_REPAIR").with(admin()))
            .andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    void shouldPageRmasInQueueOrderAcrossPages() throws Exception {
        Client client = saveClient("Queue Client", null, null);
        Product product = saveProduct("SKU-QUEUE", "Queue product", null, null);

        saveRma(client, product, "OS-Q-LOW-OLD", RmaStatus.RECEIVED, 1, RmaPriority.LOW);
        saveRma(client, product, "OS-Q-HIGH-NEW", RmaStatus.RECEIVED, 9, RmaPriority.HIGH);
        saveRma(client, product, "OS-Q-MED-OLD", RmaStatus.TRIAGE, 2, RmaPriority.MEDIUM);
        saveRma(client, product, "OS-Q-HIGH-OLD", RmaStatus.IN_REPAIR, 3, RmaPriority.HIGH);
        saveRma(client, product, "OS-Q-MED-NEW", RmaStatus.RECEIVED, 8, RmaPriority.MEDIUM);
        saveRma(client, product, "OS-Q-HIGH-SAME-1", RmaStatus.RECEIVED, 5, RmaPriority.HIGH);
        saveRma(client, product, "OS-Q-HIGH-SAME-2", RmaStatus.RECEIVED, 5, RmaPriority.HIGH);

        mockMvc.perform(get("/api/rmas").param("size", "4").with(admin()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content[*].code", contains("OS-Q-HIGH-OLD", "OS-Q-HIGH-SAME-1", "OS-Q-HIGH-SAME-2", "OS-Q-HIGH-NEW")))
            .andExpect(jsonPath("$.totalElements").value(7))
            .andExpect(jsonPath("$.totalPages").value(2));
        mockMvc.perform(get("/api/rmas").param("size", "4").param("page", "1").with(admin()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content[*].code", contains("OS-Q-MED-OLD", "OS-Q-MED-NEW", "OS-Q-LOW-OLD")));
    }

    @Test
    void shouldSummarizeRmasAcrossAllPagesWithTheListFilters() throws Exception {
        Client client = saveClient("Summary Client", null, null);
        Product product = saveProduct("SKU-SUMMARY", "Summary product", null, null);

        saveRma(client, product, "OS-S-1", RmaStatus.RECEIVED, 1, RmaPriority.HIGH);
        saveRma(client, product, "OS-S-2", RmaStatus.IN_REPAIR, 2, RmaPriority.HIGH);
        saveRma(client, product, "OS-S-3", RmaStatus.COMPLETED, 3, RmaPriority.HIGH);
        saveRma(client, product, "OS-S-4", RmaStatus.RETURNED, 4, RmaPriority.LOW);
        saveRma(client, product, "OS-S-5", RmaStatus.RECEIVED, 5, RmaPriority.MEDIUM);

        mockMvc.perform(get("/api/rmas/summary").with(admin()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.total").value(5))
            .andExpect(jsonPath("$.ongoing").value(3))
            .andExpect(jsonPath("$.highPriority").value(3));
        mockMvc.perform(get("/api/rmas/summary").param("status", "RECEIVED").with(asProfile("viewer", "VIEWER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.total").value(2))
            .andExpect(jsonPath("$.ongoing").value(2))
            .andExpect(jsonPath("$.highPriority").value(1));
        mockMvc.perform(get("/api/rmas/summary").param("query", "OS-S-3").with(admin()))
            .andExpect(jsonPath("$.total").value(1))
            .andExpect(jsonPath("$.ongoing").value(0));
        mockMvc.perform(get("/api/rmas").param("size", "2").with(admin()))
            .andExpect(jsonPath("$.content", hasSize(2)))
            .andExpect(jsonPath("$.totalElements").value(5));
    }

    private RequestPostProcessor admin() {
        return asProfile("admin", "ADMIN");
    }

    private Client saveClient(String legalName, String documentNumber, String email) {
        Client client = new Client();
        client.setLegalName(legalName);
        client.setDocumentNumber(documentNumber);
        client.setEmail(email);
        return clientRepository.save(client);
    }

    private Product saveProduct(String sku, String name, String category, String firmwareVersion) {
        Product product = new Product();
        product.setSku(sku);
        product.setName(name);
        product.setCategory(category);
        product.setFirmwareVersion(firmwareVersion);
        product.setDefaultWarrantyMonths(12);
        return productRepository.save(product);
    }

    private void saveUser(String username, String fullName, AccessProfile profile, Set<String> extras, boolean active) {
        UserAccount account = new UserAccount();
        account.setUsername(username);
        account.setFullName(fullName);
        account.setPasswordHash("hash");
        account.setProfile(profile);
        account.setExtraPermissions(new HashSet<>(extras));
        account.setActive(active);
        userAccountRepository.save(account);
    }

    private Long profileId(String legacyCode) {
        return accessProfiles.findByLegacyCode(legacyCode).orElseThrow().getId();
    }

    private void saveUser(String username, String fullName, String role, boolean active) {
        UserAccount account = new UserAccount();
        account.setUsername(username);
        account.setFullName(fullName);
        account.setPasswordHash("hash");
        AccessTestSupport.assignProfile(accessProfiles, account, role);
        account.setActive(active);
        userAccountRepository.save(account);
    }

    private void saveRma(Client client, Product product, String code, RmaStatus rmaStatus, int daysAfter) {
        saveRma(client, product, code, rmaStatus, daysAfter, RmaPriority.MEDIUM);
    }

    private void saveRma(Client client, Product product, String code, RmaStatus rmaStatus, int daysAfter, RmaPriority priority) {
        RmaRecord rma = new RmaRecord();
        rma.setCode(code);
        rma.setPriority(priority);
        rma.setClient(client);
        rma.setProduct(product);
        rma.setStatus(rmaStatus);
        rma.setEntryDate(LocalDate.of(2026, 1, 1).plusDays(daysAfter));
        rma.setReceivedBy("Test user");
        rma.setReportedFailure("Failure");
        rma.getItemIdentification().setSerialNumber("SERIAL-" + code);
        RmaItem item = new RmaItem();
        item.setProduct(product);
        item.getItemIdentification().setSerialNumber("SERIAL-" + code);
        rma.addItem(item);
        RmaStatusHistory history = new RmaStatusHistory();
        history.setStatus(rmaStatus);
        history.setChangedBy("admin");
        history.setChangedAt(Instant.parse("2026-01-01T10:00:00Z"));
        rma.addStatusHistory(history);
        rmaRecordRepository.save(rma);
    }
}
