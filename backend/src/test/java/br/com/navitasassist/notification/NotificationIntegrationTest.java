package br.com.navitasassist.notification;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.NotificationEventRepository;
import br.com.navitasassist.repository.NotificationMuteRepository;
import br.com.navitasassist.repository.NotificationRepository;
import br.com.navitasassist.repository.NotificationRuleRepository;
import br.com.navitasassist.repository.ProductRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.rma.CreateRmaRequest;
import br.com.navitasassist.rma.RmaItemRequest;
import br.com.navitasassist.rma.RmaPriority;
import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.rma.RmaResponse;
import br.com.navitasassist.service.NotificationProcessor;
import br.com.navitasassist.service.RmaService;
import br.com.navitasassist.service.SlaNotificationScanner;
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
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class NotificationIntegrationTest {

    private static final RequestPostProcessor ADMIN = user("admin").roles("ADMIN");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private RmaService rmaService;

    @Autowired
    private NotificationProcessor notificationProcessor;

    @Autowired
    private SlaNotificationScanner slaNotificationScanner;

    @Autowired
    private NotificationRepository notificationRepository;

    @Autowired
    private NotificationEventRepository notificationEventRepository;

    @Autowired
    private NotificationRuleRepository notificationRuleRepository;

    @Autowired
    private NotificationMuteRepository notificationMuteRepository;

    @Autowired
    private UserAccountRepository userAccountRepository;

    @Autowired
    private RmaRecordRepository rmaRecordRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private ClientRepository clientRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private final List<Long> createdUserIds = new ArrayList<>();
    private UserAccount technician;
    private UserAccount otherTechnician;
    private UserAccount desk;
    private UserAccount inactiveDesk;
    private UserAccount viewer;
    private Client client;
    private Product product;

    @BeforeEach
    void setUp() {
        cleanUp();
        resetRules();
        technician = createUser("nav40-tech", UserRole.TECHNICIAN, true);
        otherTechnician = createUser("nav40-tech-2", UserRole.TECHNICIAN, true);
        desk = createUser("nav40-desk", UserRole.SERVICE_DESK, true);
        inactiveDesk = createUser("nav40-desk-off", UserRole.SERVICE_DESK, false);
        viewer = createUser("nav40-viewer", UserRole.VIEWER, true);
        client = new Client();
        client.setLegalName("Cliente notificações");
        client = clientRepository.save(client);
        product = new Product();
        product.setSku("SKU-NAV40");
        product.setName("Controlador NAV-40");
        product = productRepository.save(product);
    }

    @AfterEach
    void cleanUp() {
        notificationMuteRepository.deleteAll();
        notificationRepository.deleteAll();
        notificationEventRepository.deleteAll();
        rmaRecordRepository.deleteAll();
        productRepository.deleteAll();
        clientRepository.deleteAll();
        userAccountRepository.findAll().stream().filter(account -> account.getUsername().startsWith("nav40-")).forEach(userAccountRepository::delete);
        createdUserIds.clear();
        resetRules();
    }

    @Test
    void newRmaNotifiesConfiguredActiveRolesOnlyOnce() throws Exception {
        RmaResponse rma = createRma();

        assertEquals(1, countFor(desk, NotificationEventType.RMA_CREATED));
        assertEquals(1, countFor(admin(), NotificationEventType.RMA_CREATED));
        assertEquals(0, countFor(inactiveDesk, NotificationEventType.RMA_CREATED));
        assertEquals(0, countFor(technician, NotificationEventType.RMA_CREATED));
        assertEquals(0, countFor(viewer, NotificationEventType.RMA_CREATED));

        notificationProcessor.process(new RmaNotificationEvent(NotificationEventType.RMA_CREATED, "RMA_CREATED:" + rma.id(), rma.id(), Instant.now()));
        notificationProcessor.process(new RmaNotificationEvent(NotificationEventType.RMA_CREATED, "RMA_CREATED:" + rma.id(), rma.id(), Instant.now()));

        assertEquals(1, countFor(desk, NotificationEventType.RMA_CREATED));
        assertEquals(1, notificationEventRepository.findAll().stream().filter(event -> event.getEventKey().equals("RMA_CREATED:" + rma.id())).count());

        mockMvc.perform(get("/api/notifications").with(as(desk)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].eventType").value("RMA_CREATED"))
            .andExpect(jsonPath("$[0].severity").value("INFO"))
            .andExpect(jsonPath("$[0].title").value(containsString(rma.code())))
            .andExpect(jsonPath("$[0].message").value(containsString("Cliente notificações")))
            .andExpect(jsonPath("$[0].rmaCode").value(rma.code()))
            .andExpect(jsonPath("$[0].actionPath").value("/rmas?rma=" + rma.id()))
            .andExpect(jsonPath("$[0].read").value(false));
    }

    @Test
    void assignmentNotifiesOnlyTheNewAssigneeWithInternalAction() throws Exception {
        RmaResponse rma = createRma();

        mockMvc.perform(patch("/api/rmas/{id}/assignee", rma.id()).with(as(desk)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("assigneeId", technician.getId()))))
            .andExpect(status().isOk());

        assertEquals(1, countFor(technician, NotificationEventType.RMA_ASSIGNED));
        assertEquals(0, countFor(otherTechnician, NotificationEventType.RMA_ASSIGNED));
        assertEquals(0, countFor(desk, NotificationEventType.RMA_ASSIGNED));

        mockMvc.perform(get("/api/notifications").with(as(technician)))
            .andExpect(jsonPath("$[0].eventType").value("RMA_ASSIGNED"))
            .andExpect(jsonPath("$[0].title").value(containsString(rma.code())))
            .andExpect(jsonPath("$[0].message").value(containsString("nav40-desk")))
            .andExpect(jsonPath("$[0].actionPath").value("/rmas?rma=" + rma.id()));
    }

    @Test
    void disabledRuleSkipsEventsWithoutRedeploy() throws Exception {
        Map<String, Object> disabled = rulePayload(false, "INFO", Set.of("ADMIN", "SERVICE_DESK"));

        mockMvc.perform(put("/api/notification-rules/RMA_CREATED").with(as(desk)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(disabled)))
            .andExpect(status().isForbidden());
        mockMvc.perform(put("/api/notification-rules/RMA_CREATED").with(ADMIN).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(disabled)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.enabled").value(false))
            .andExpect(jsonPath("$.updatedBy").value("admin"));

        RmaResponse skipped = createRma();
        assertEquals(0, countFor(desk, NotificationEventType.RMA_CREATED));
        assertEquals(NotificationEventStatus.SKIPPED, eventFor("RMA_CREATED:" + skipped.id()).getStatus());

        mockMvc.perform(put("/api/notification-rules/RMA_CREATED").with(ADMIN).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(rulePayload(true, "CRITICAL", Set.of("TECHNICIAN")))))
            .andExpect(status().isOk());

        createRma();
        assertEquals(0, countFor(desk, NotificationEventType.RMA_CREATED));
        assertEquals(1, countFor(technician, NotificationEventType.RMA_CREATED));
        mockMvc.perform(get("/api/notifications").with(as(technician))).andExpect(jsonPath("$[0].severity").value("CRITICAL"));
    }

    @Test
    void usersOnlyManageTheirOwnNotifications() throws Exception {
        createRma();
        Notification deskNotification = notificationRepository.findAll().stream().filter(notification -> notification.getRecipient().getId().equals(desk.getId())).findFirst().orElseThrow();

        mockMvc.perform(get("/api/notifications/summary").with(as(desk))).andExpect(jsonPath("$.unread").value(1));
        mockMvc.perform(post("/api/notifications/{id}/read", deskNotification.getId()).with(as(technician)).with(csrf())).andExpect(status().isNotFound());
        mockMvc.perform(post("/api/notifications/{id}/read", deskNotification.getId()).with(as(desk)).with(csrf()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.read").value(true));
        mockMvc.perform(get("/api/notifications/summary").with(as(desk))).andExpect(jsonPath("$.unread").value(0));
        mockMvc.perform(get("/api/notifications").with(as(technician))).andExpect(jsonPath("$", hasSize(0)));
        mockMvc.perform(get("/api/notifications")).andExpect(status().isUnauthorized());
    }

    @Test
    void snoozedNotificationsLeaveTheInboxUntilTheirTime() throws Exception {
        createRma();
        Long id = notificationRepository.findAll().stream().filter(notification -> notification.getRecipient().getId().equals(desk.getId())).findFirst().orElseThrow().getId();

        mockMvc.perform(post("/api/notifications/{id}/snooze", id).with(as(desk)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"minutes\":1}"))
            .andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/notifications/{id}/snooze", id).with(as(desk)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"minutes\":60}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.snoozedUntil").isNotEmpty());

        mockMvc.perform(get("/api/notifications").with(as(desk))).andExpect(jsonPath("$", hasSize(0)));
        mockMvc.perform(get("/api/notifications").param("includeSnoozed", "true").with(as(desk))).andExpect(jsonPath("$", hasSize(1)));
        mockMvc.perform(get("/api/notifications/summary").with(as(desk))).andExpect(jsonPath("$.unread").value(0));

        createRma();
        mockMvc.perform(post("/api/notifications/read-all").with(as(desk)).with(csrf())).andExpect(status().isNoContent());
        mockMvc.perform(get("/api/notifications").param("unreadOnly", "true").param("includeSnoozed", "true").with(as(desk))).andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void usersCanMuteOnlyRulesThatAllowIt() throws Exception {
        mockMvc.perform(get("/api/notifications/preferences").with(as(desk)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(4)));

        mockMvc.perform(put("/api/notifications/preferences/RMA_ASSIGNED").with(as(technician)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"muted\":true}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("This notification rule cannot be muted: RMA_ASSIGNED"));

        mockMvc.perform(put("/api/notifications/preferences/RMA_CREATED").with(as(desk)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"muted\":true}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.muted").value(true));

        createRma();
        assertEquals(0, countFor(desk, NotificationEventType.RMA_CREATED));
        assertEquals(1, countFor(admin(), NotificationEventType.RMA_CREATED));

        mockMvc.perform(put("/api/notifications/preferences/RMA_CREATED").with(as(desk)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"muted\":false}"))
            .andExpect(jsonPath("$.muted").value(false));
        createRma();
        assertEquals(1, countFor(desk, NotificationEventType.RMA_CREATED));
    }

    @Test
    void slaScanAlertsOverdueRmasOncePerStage() throws Exception {
        RmaResponse created = createRma();
        rmaService.updateAssignee(created.id(), new br.com.navitasassist.rma.RmaAssigneeUpdateRequest(technician.getId()));
        RmaRecord rma = rmaRecordRepository.findById(created.id()).orElseThrow();
        backdateStage(rma, Instant.now().minus(Duration.ofDays(30)));

        slaNotificationScanner.scan(Instant.now());
        slaNotificationScanner.scan(Instant.now());

        assertEquals(1, countFor(technician, NotificationEventType.SLA_OVERDUE));
        assertEquals(1, countFor(admin(), NotificationEventType.SLA_OVERDUE));
        assertEquals(1, countFor(desk, NotificationEventType.SLA_OVERDUE));
        assertEquals(0, countFor(viewer, NotificationEventType.SLA_OVERDUE));
        mockMvc.perform(get("/api/notifications").param("unreadOnly", "true").with(as(technician)))
            .andExpect(jsonPath("$[0].eventType").value("SLA_OVERDUE"))
            .andExpect(jsonPath("$[0].severity").value("CRITICAL"));
    }

    @Test
    void processingFailuresAreRecordedAndVisibleToAdmins() throws Exception {
        notificationProcessor.process(new RmaNotificationEvent(NotificationEventType.RMA_CREATED, "RMA_CREATED:missing", 999999L, Instant.now()));

        NotificationEvent failed = eventFor("RMA_CREATED:missing");
        assertEquals(NotificationEventStatus.FAILED, failed.getStatus());
        assertNotNull(failed.getErrorMessage());

        mockMvc.perform(get("/api/notification-rules/failures").with(as(desk))).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/notification-rules/failures").with(ADMIN))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].source").value("EVENT"))
            .andExpect(jsonPath("$[0].eventKey").value("RMA_CREATED:missing"));
    }

    @Test
    void unsupportedEventTypesAreSkippedUntilTheirRuleExists() {
        RmaResponse rma = createRma();
        notificationProcessor.process(new RmaNotificationEvent(NotificationEventType.PART_PENDING, "PART_PENDING:" + rma.id(), rma.id(), Instant.now()));

        assertEquals(NotificationEventStatus.SKIPPED, eventFor("PART_PENDING:" + rma.id()).getStatus());
        assertTrue(notificationRepository.findAll().stream().noneMatch(notification -> notification.getEventType() == NotificationEventType.PART_PENDING));
    }

    private RmaResponse createRma() {
        return rmaService.create(new CreateRmaRequest(client.getId(), List.of(new RmaItemRequest(product.getId(), null, "SER-NAV40-" + System.nanoTime(), null)), null, true,
            LocalDate.now(), null, "Não liga", null, null, RmaPriority.HIGH, null, null, null));
    }

    private void backdateStage(RmaRecord rma, Instant enteredAt) {
        jdbcTemplate.update("UPDATE rma_status_history SET changed_at = ? WHERE rma_id = ?", java.sql.Timestamp.from(enteredAt), rma.getId());
    }

    private UserAccount createUser(String username, UserRole role, boolean active) {
        UserAccount account = new UserAccount();
        account.setUsername(username);
        account.setFullName(username);
        account.setPasswordHash("not-used");
        account.setRole(role);
        account.setActive(active);
        account = userAccountRepository.save(account);
        createdUserIds.add(account.getId());
        return account;
    }

    private UserAccount admin() {
        return userAccountRepository.findByUsernameIgnoreCase("admin").orElseThrow();
    }

    private RequestPostProcessor as(UserAccount account) {
        return user(account.getUsername()).roles(account.getRole().name());
    }

    private long countFor(UserAccount account, NotificationEventType type) {
        return notificationRepository.findAll().stream().filter(notification -> notification.getRecipient().getId().equals(account.getId()) && notification.getEventType() == type).count();
    }

    private NotificationEvent eventFor(String key) {
        return notificationEventRepository.findAll().stream().filter(event -> event.getEventKey().equals(key)).findFirst().orElseThrow();
    }

    private Map<String, Object> rulePayload(boolean enabled, String severity, Set<String> roles) {
        return Map.of("enabled", enabled, "severity", severity, "recipientRoles", roles, "notifyAssignee", false, "emailEnabled", false, "userMutable", true);
    }

    private void resetRules() {
        reset(NotificationEventType.RMA_CREATED, NotificationSeverity.INFO, Set.of(UserRole.ADMIN, UserRole.SERVICE_DESK), false, true);
        reset(NotificationEventType.RMA_ASSIGNED, NotificationSeverity.INFO, Set.of(), true, false);
        reset(NotificationEventType.SLA_WARNING, NotificationSeverity.WARNING, Set.of(UserRole.ADMIN), true, true);
        reset(NotificationEventType.SLA_OVERDUE, NotificationSeverity.CRITICAL, Set.of(UserRole.ADMIN, UserRole.SERVICE_DESK), true, false);
    }

    private void reset(NotificationEventType type, NotificationSeverity severity, Set<UserRole> roles, boolean notifyAssignee, boolean userMutable) {
        NotificationRule rule = notificationRuleRepository.findByEventType(type).orElseThrow();
        rule.setEnabled(true);
        rule.setSeverity(severity);
        rule.setRecipientRoles(roles.isEmpty() ? java.util.EnumSet.noneOf(UserRole.class) : java.util.EnumSet.copyOf(roles));
        rule.setNotifyAssignee(notifyAssignee);
        rule.setEmailEnabled(false);
        rule.setUserMutable(userMutable);
        notificationRuleRepository.save(rule);
    }
}
