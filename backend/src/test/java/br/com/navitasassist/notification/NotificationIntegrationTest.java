package br.com.navitasassist.notification;

import static br.com.navitasassist.access.AccessTestSupport.asProfile;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import br.com.navitasassist.access.AccessTestSupport;
import br.com.navitasassist.repository.AccessProfileRepository;
import br.com.navitasassist.client.Client;
import br.com.navitasassist.config.NotificationAsyncConfig;
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
import br.com.navitasassist.rma.RmaDetailResponse;
import br.com.navitasassist.service.NotificationProcessor;
import br.com.navitasassist.service.RmaService;
import br.com.navitasassist.user.UserAccount;
import br.com.navitasassist.user.UserAccountTestSupport;
import br.com.navitasassist.access.AccessProfile;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class NotificationIntegrationTest {
    @Autowired org.springframework.jdbc.core.JdbcTemplate auditJdbc;

    private static final RequestPostProcessor ADMIN = asProfile("admin", "ADMIN");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private RmaService rmaService;

    @Autowired
    private NotificationProcessor notificationProcessor;

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
    private AccessProfileRepository accessProfiles;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private RmaRecordRepository rmaRecordRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private ClientRepository clientRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    @Qualifier(NotificationAsyncConfig.NOTIFICATION_EXECUTOR)
    private ThreadPoolTaskExecutor notificationExecutor;

    @Autowired private br.com.navitasassist.service.PartStockService partStockService;
    @Autowired private br.com.navitasassist.repository.PartRepository partRepository;
    @Autowired private br.com.navitasassist.service.ProtocolTemplateService templateService;
    @Autowired private br.com.navitasassist.service.ProtocolExecutionService executionService;
    @Autowired private org.springframework.transaction.PlatformTransactionManager transactionManager;
    @org.springframework.boot.test.mock.mockito.SpyBean
    private br.com.navitasassist.service.NotificationDispatcher dispatcher;

    private static final String CUSTOM_PROFILE = "nav40 perfil";

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
        UserAccountTestSupport.ensureAdmin(userAccountRepository, accessProfiles, passwordEncoder);
        technician = createUser("nav40-tech", "TECHNICIAN", true);
        otherTechnician = createUser("nav40-tech-2", "TECHNICIAN", true);
        desk = createUser("nav40-desk", "SERVICE_DESK", true);
        inactiveDesk = createUser("nav40-desk-off", "SERVICE_DESK", false);
        viewer = createUser("nav40-viewer", "VIEWER", true);
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
        NotificationTestSupport.awaitIdle(notificationExecutor);
        org.mockito.Mockito.reset(dispatcher);
        jdbcTemplate.update("DELETE FROM rma_protocol_item_results");
        jdbcTemplate.update("DELETE FROM rma_protocol_executions");
        jdbcTemplate.update("DELETE FROM protocol_template_items");
        jdbcTemplate.update("DELETE FROM protocol_template_versions");
        jdbcTemplate.update("DELETE FROM protocol_templates");
        jdbcTemplate.update("DELETE FROM part_movements");
        jdbcTemplate.update("DELETE FROM part_reservations");
        partRepository.deleteAll();
        notificationMuteRepository.deleteAll();
        notificationRepository.deleteAll();
        notificationEventRepository.deleteAll();
        rmaRecordRepository.deleteAll();
        productRepository.deleteAll();
        clientRepository.deleteAll();
        userAccountRepository.findAll().stream().filter(account -> account.getUsername().startsWith("nav40-")).forEach(userAccountRepository::delete);
        createdUserIds.clear();
        resetRules();
        accessProfiles.findAll().stream().filter(profile -> profile.getName().startsWith(CUSTOM_PROFILE)).forEach(accessProfiles::delete);
        accessProfiles.flush();
    }

    @Test
    void newRmaNotifiesConfiguredActiveRolesOnlyOnce() throws Exception {
        RmaDetailResponse rma = createRma();

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
        RmaDetailResponse rma = createRma();

        mockMvc.perform(patch("/api/rmas/{id}/assignee", rma.id()).with(as(desk)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("assigneeId", technician.getId()))))
            .andExpect(status().isOk());
        NotificationTestSupport.awaitIdle(notificationExecutor);

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
        org.assertj.core.api.Assertions.assertThat(auditJdbc.queryForObject("select count(*) from audit_events where action = 'RULE_UPDATE' and entity_type = 'NOTIFICATION_RULE'", Long.class)).isPositive();

        RmaDetailResponse skipped = createRma();
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
        Long id = saveNotification(desk, NotificationEventType.RMA_BLOCKED, null).getId();

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

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.EnumSource(value = NotificationEventType.class, names = {"RMA_BLOCKED", "PART_PENDING", "TEST_FAILED"})
    void notificationsThatAskForActionCanBeSnoozed(NotificationEventType type) throws Exception {
        assertTrue(type.isSnoozable());
        Long id = saveNotification(desk, type, null).getId();

        mockMvc.perform(post("/api/notifications/{id}/snooze", id).with(as(desk)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"minutes\":60}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.snoozedUntil").isNotEmpty());
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.EnumSource(value = NotificationEventType.class, names = {"RMA_CREATED", "RMA_ASSIGNED"})
    void informationalNotificationsCannotBeSnoozed(NotificationEventType type) throws Exception {
        org.junit.jupiter.api.Assertions.assertFalse(type.isSnoozable());
        Long id = saveNotification(desk, type, null).getId();

        mockMvc.perform(post("/api/notifications/{id}/snooze", id).with(as(desk)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"minutes\":60}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Esta notificação é apenas informativa e não pode ser adiada."));

        org.junit.jupiter.api.Assertions.assertNull(notificationRepository.findById(id).orElseThrow().getSnoozedUntil());
        mockMvc.perform(get("/api/notifications").with(as(desk))).andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    void informationalNotificationsSnoozedBeforeTheRuleStayVisibleAndCounted() throws Exception {
        Instant later = Instant.now().plusSeconds(3600);
        Notification legacy = saveNotification(desk, NotificationEventType.RMA_CREATED, later);
        saveNotification(desk, NotificationEventType.RMA_BLOCKED, later);

        mockMvc.perform(get("/api/notifications").with(as(desk)))
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].id").value(legacy.getId()))
            .andExpect(jsonPath("$[0].snoozedUntil").value(org.hamcrest.Matchers.nullValue()));
        mockMvc.perform(get("/api/notifications").param("includeSnoozed", "true").with(as(desk)))
            .andExpect(jsonPath("$", hasSize(2)))
            .andExpect(jsonPath("$[?(@.eventType == 'RMA_BLOCKED')].snoozedUntil", hasSize(1)))
            .andExpect(jsonPath("$[?(@.eventType == 'RMA_CREATED')].snoozedUntil", contains(org.hamcrest.Matchers.nullValue())));
        mockMvc.perform(get("/api/notifications/summary").with(as(desk))).andExpect(jsonPath("$.unread").value(1));
    }

    @Test
    void usersCanMuteOnlyRulesThatAllowIt() throws Exception {
        mockMvc.perform(get("/api/notifications/preferences").with(as(desk)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(5)));

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
    void stageSlaAlertsNoLongerExist() throws Exception {
        assertTrue(java.util.Arrays.stream(NotificationEventType.values()).noneMatch(type -> type.name().startsWith("SLA_")));
        mockMvc.perform(get("/api/notification-rules").with(ADMIN))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.eventType =~ /SLA_.*/)]", hasSize(0)));
        mockMvc.perform(get("/api/notifications/preferences").with(as(desk)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.eventType =~ /SLA_.*/)]", hasSize(0)));
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
    void notifiesUsersOfRecipientProfiles() throws Exception {
        AccessProfile custom = AccessTestSupport.saveProfile(accessProfiles, CUSTOM_PROFILE + " plantão", "rma.ver");
        UserAccount onCall = AccessTestSupport.saveAccountWithProfile(userAccountRepository, passwordEncoder, "nav40-plantao", custom, Set.of());

        mockMvc.perform(put("/api/notification-rules/RMA_CREATED").with(ADMIN).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(rulePayloadForProfiles(true, "INFO", List.of(custom.getId(), profile("ADMIN").getId())))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.recipientProfiles[*].name", contains("Administrador", CUSTOM_PROFILE + " plantão")))
            .andExpect(jsonPath("$.recipientProfiles[1].id").value(custom.getId()))
            .andExpect(jsonPath("$.recipientRoles").doesNotExist());

        createRma();
        assertEquals(1, countFor(onCall, NotificationEventType.RMA_CREATED));
        assertEquals(1, countFor(admin(), NotificationEventType.RMA_CREATED));
        assertEquals(0, countFor(desk, NotificationEventType.RMA_CREATED));
    }

    @Test
    void rejectsUnknownRecipientProfile() throws Exception {
        mockMvc.perform(put("/api/notification-rules/RMA_CREATED").with(ADMIN).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(rulePayloadForProfiles(true, "INFO", List.of(999999L)))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Perfil não encontrado: 999999."));
        mockMvc.perform(get("/api/notification-rules").with(ADMIN))
            .andExpect(jsonPath("$[?(@.eventType == 'RMA_CREATED')].recipientProfiles[*].name", containsInAnyOrder("Administrador", "Atendimento")));
    }

    @Test
    void deletingProfileRemovesItFromRules() throws Exception {
        AccessProfile custom = AccessTestSupport.saveProfile(accessProfiles, CUSTOM_PROFILE + " temporário", "rma.ver");
        mockMvc.perform(put("/api/notification-rules/RMA_CREATED").with(ADMIN).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(rulePayloadForProfiles(true, "INFO", List.of(custom.getId())))))
            .andExpect(status().isOk());

        mockMvc.perform(delete("/api/profiles/{id}", custom.getId()).with(ADMIN).with(csrf())).andExpect(status().isNoContent());

        mockMvc.perform(get("/api/notification-rules").with(ADMIN))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.eventType == 'RMA_CREATED')].recipientProfiles[*]", hasSize(0)));
    }

    @Test
    void appliesFiltersBeforeLimitAndReadAllIncludesSnoozedOutsideFirstPage() throws Exception {
        createRma();
        Notification original = notificationRepository.findAll().stream().filter(n -> n.getRecipient().getId().equals(desk.getId())).findFirst().orElseThrow();
        for (int i = 0; i < 105; i++) {
            NotificationEvent event = new NotificationEvent();
            event.setEventKey("filter-" + i);
            event.setEventType(NotificationEventType.RMA_CREATED);
            event.setStatus(NotificationEventStatus.PROCESSED);
            event.setOccurredAt(Instant.now());
            event = notificationEventRepository.save(event);
            Notification n = new Notification();
            n.setEvent(event);
            n.setRecipient(desk);
            n.setEventType(i == 0 ? NotificationEventType.RMA_ASSIGNED : NotificationEventType.RMA_CREATED);
            n.setSeverity(i == 0 ? NotificationSeverity.CRITICAL : NotificationSeverity.INFO);
            n.setTitle("Test"); n.setMessage("Test");
            n.setCreatedAt(original.getCreatedAt().plusSeconds(i + 1));
            n.setSnoozedUntil(Instant.now().plusSeconds(3600));
            notificationRepository.save(n);
        }
        mockMvc.perform(get("/api/notifications").param("eventType", "RMA_ASSIGNED").param("severity", "CRITICAL").param("includeSnoozed", "true").with(as(desk)))
            .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].eventType").value("RMA_ASSIGNED"));
        mockMvc.perform(post("/api/notifications/read-all").with(as(desk)).with(csrf())).andExpect(status().isNoContent());
        assertEquals(0, notificationRepository.findAll().stream().filter(n -> n.getRecipient().getId().equals(desk.getId()) && n.getReadAt() == null).count());
        mockMvc.perform(get("/api/notifications").param("severity", "INVALID").with(as(desk))).andExpect(status().isBadRequest());
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.EnumSource(value = NotificationEventType.class, names = {"RMA_BLOCKED", "PART_PENDING", "TEST_FAILED"})
    void realProducersNotifyDefaultRecipientsAndDeduplicate(NotificationEventType type) {
        RmaDetailResponse rma = assignedRma();
        produce(type, rma.id());
        NotificationEvent event = latestEvent(type);
        assertEquals(NotificationEventStatus.PROCESSED, event.getStatus());
        assertTrue(event.getEventKey().matches(type.name() + ":[0-9]+"), event.getEventKey());
        assertEquals(1, countFor(admin(), type));
        assertEquals(type == NotificationEventType.PART_PENDING ? 0 : 1, countFor(technician, type));
        assertEquals(0, countFor(desk, type));
        notificationRepository.findAll().stream().filter(n -> n.getEventType() == type).forEach(n -> {
            assertEquals(NotificationSeverity.WARNING, n.getSeverity());
            assertEquals(NotificationEmailStatus.NOT_REQUESTED, n.getEmailStatus());
            assertTrue(n.getTitle().contains(rma.code()));
            assertTrue(n.getMessage().contains(switch (type) {
                case RMA_BLOCKED -> "Aguardando equipamento";
                case PART_PENDING -> "sem saldo disponível";
                case TEST_FAILED -> "Tensão reprovado";
                default -> throw new IllegalArgumentException();
            }));
            assertEquals("/rmas?rma=" + rma.id(), n.getActionPath());
        });
        notificationProcessor.process(new RmaNotificationEvent(type, event.getEventKey(), rma.id(), event.getOccurredAt()));
        assertEquals(1, countFor(admin(), type));
        if (type == NotificationEventType.RMA_BLOCKED) {
            Long blockId = rmaService.getById(rma.id()).blockHistory().get(0).id();
            rmaService.resolveBlock(rma.id(), blockId, new br.com.navitasassist.rma.RmaBlockResolveRequest("Resolvido"));
        }
        produce(type, rma.id());
        assertEquals(2, countFor(admin(), type));
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.EnumSource(value = NotificationEventType.class, names = {"RMA_BLOCKED", "PART_PENDING", "TEST_FAILED"})
    void realProducersRespectDisabledRules(NotificationEventType type) {
        RmaDetailResponse rma = assignedRma();
        NotificationRule rule = notificationRuleRepository.findByEventType(type).orElseThrow();
        rule.setEnabled(false);
        notificationRuleRepository.save(rule);
        produce(type, rma.id());
        assertEquals(NotificationEventStatus.SKIPPED, latestEvent(type).getStatus());
        assertEquals(0, countFor(admin(), type));
        assertEquals(0, countFor(technician, type));
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.EnumSource(value = NotificationEventType.class, names = {"RMA_BLOCKED", "PART_PENDING", "TEST_FAILED"})
    void realProducersWithoutRecipientsCreateNoNotifications(NotificationEventType type) {
        NotificationRule rule = notificationRuleRepository.findByEventType(type).orElseThrow();
        rule.setRecipientProfiles(new java.util.HashSet<>());
        notificationRuleRepository.save(rule);
        produce(type, createRma().id());
        assertEquals(0, latestEvent(type).getRecipientCount());
        assertTrue(notificationRepository.findAll().stream().noneMatch(n -> n.getEventType() == type));
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.EnumSource(value = NotificationEventType.class, names = {"RMA_BLOCKED", "PART_PENDING", "TEST_FAILED"})
    void realProducersRequireRmaVisibility(NotificationEventType type) {
        AccessProfile hidden = AccessTestSupport.saveProfile(accessProfiles, CUSTOM_PROFILE + " sem acesso");
        UserAccount hiddenUser = AccessTestSupport.saveAccountWithProfile(userAccountRepository, passwordEncoder, "nav40-hidden", hidden, Set.of());
        NotificationRule rule = notificationRuleRepository.findByEventType(type).orElseThrow();
        rule.setRecipientProfiles(new java.util.HashSet<>(Set.of(hidden)));
        notificationRuleRepository.save(rule);
        RmaDetailResponse rma = createRma();
        jdbcTemplate.update("UPDATE rmas SET assignee_id=? WHERE id=?", hiddenUser.getId(), rma.id());
        produce(type, rma.id());
        assertEquals(0, latestEvent(type).getRecipientCount());
        assertEquals(0, countFor(hiddenUser, type));
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.EnumSource(value = NotificationEventType.class, names = {"RMA_BLOCKED", "PART_PENDING", "TEST_FAILED"})
    void notificationFailureCannotUndoBusinessOperation(NotificationEventType type) {
        RmaDetailResponse rma = assignedRma();
        org.mockito.Mockito.doThrow(new IllegalStateException("Falha simulada"))
            .when(dispatcher).dispatch(org.mockito.ArgumentMatchers.anyLong(), org.mockito.ArgumentMatchers.argThat(e -> e.type() == type));
        produce(type, rma.id());
        assertEquals(NotificationEventStatus.FAILED, latestEvent(type).getStatus());
        assertTrue(switch (type) {
            case RMA_BLOCKED -> jdbcTemplate.queryForObject("SELECT COUNT(*) FROM rma_blocks WHERE rma_id=?", Integer.class, rma.id()) > 0;
            case PART_PENDING -> partStockService.getRmaParts(rma.id()).pendingCount() > 0;
            case TEST_FAILED -> executionService.listForRma(rma.id()).get(0).failedItems() > 0;
            default -> false;
        });
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.EnumSource(value = NotificationEventType.class, names = {"RMA_BLOCKED", "PART_PENDING", "TEST_FAILED"})
    void producersWaitForCommitAndIgnoreRollback(NotificationEventType type) {
        RmaDetailResponse rma = assignedRma();
        new org.springframework.transaction.support.TransactionTemplate(transactionManager).executeWithoutResult(tx -> {
            produce(type, rma.id());
            assertTrue(notificationEventRepository.findAll().stream().noneMatch(e -> e.getEventType() == type));
            tx.setRollbackOnly();
        });
        NotificationTestSupport.awaitIdle(notificationExecutor);
        assertTrue(notificationEventRepository.findAll().stream().noneMatch(e -> e.getEventType() == type));
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.EnumSource(value = NotificationEventType.class, names = {"RMA_BLOCKED", "PART_PENDING", "TEST_FAILED"})
    void assigneeInAdministratorProfileReceivesOnlyOnce(NotificationEventType type) {
        RmaDetailResponse rma = createRma();
        jdbcTemplate.update("UPDATE rmas SET assignee_id=? WHERE id=?", admin().getId(), rma.id());
        produce(type, rma.id());
        assertEquals(1, latestEvent(type).getRecipientCount());
        assertEquals(1, countFor(admin(), type));
    }

    @Test
    void stockAvailableAndPassingOrInapplicableResultsDoNotRaiseWarnings() {
        RmaDetailResponse rma = assignedRma();
        br.com.navitasassist.part.Part part = new br.com.navitasassist.part.Part();
        part.setCode("nav40-available"); part.setName("Fusível"); part.setUnit("UN");
        part.setOnHand(java.math.BigDecimal.TEN);
        part = partRepository.save(part);
        assertEquals(br.com.navitasassist.part.PartReservationStatus.ACTIVE,
            partStockService.reserve(rma.id(), new br.com.navitasassist.part.PartReservationRequest(part.getId(), java.math.BigDecimal.ONE, null)).status());
        var item = new br.com.navitasassist.protocol.ProtocolTemplateItemRequest("Bancada", "Inspeção", null,
            br.com.navitasassist.protocol.ProtocolItemType.CHECK, true, null, null, null, null, null, false);
        var template = templateService.create(new br.com.navitasassist.protocol.ProtocolTemplateRequest("Teste", product.getId(), null, true, Set.of(), List.of(item)));
        var execution = executionService.start(rma.id(), template.id());
        for (var outcome : List.of(br.com.navitasassist.protocol.ProtocolItemOutcome.PASSED, br.com.navitasassist.protocol.ProtocolItemOutcome.NOT_APPLICABLE)) {
            executionService.recordResult(execution.id(), template.items().get(0).id(), new br.com.navitasassist.protocol.ProtocolItemResultRequest(outcome, null, null, null, "Conferido", null));
        }
        NotificationTestSupport.awaitIdle(notificationExecutor);
        assertTrue(notificationEventRepository.findAll().stream().noneMatch(e -> e.getEventType() == NotificationEventType.PART_PENDING || e.getEventType() == NotificationEventType.TEST_FAILED));
    }

    private RmaDetailResponse assignedRma() {
        RmaDetailResponse rma = createRma();
        jdbcTemplate.update("UPDATE rmas SET assignee_id=? WHERE id=?", technician.getId(), rma.id());
        return rma;
    }

    private NotificationEvent latestEvent(NotificationEventType type) {
        return notificationEventRepository.findAll().stream().filter(e -> e.getEventType() == type)
            .max(java.util.Comparator.comparing(NotificationEvent::getId)).orElseThrow();
    }

    private void produce(NotificationEventType type, Long rmaId) {
        switch (type) {
            case RMA_BLOCKED -> rmaService.block(rmaId, new br.com.navitasassist.rma.RmaBlockRequest("Aguardando equipamento", "Externo"));
            case PART_PENDING -> {
                br.com.navitasassist.part.Part part = new br.com.navitasassist.part.Part();
                part.setCode("nav40-" + System.nanoTime()); part.setName("Fusível"); part.setUnit("UN");
                part = partRepository.save(part);
                assertEquals(br.com.navitasassist.part.PartReservationStatus.PENDING,
                    partStockService.reserve(rmaId, new br.com.navitasassist.part.PartReservationRequest(part.getId(), java.math.BigDecimal.ONE, null)).status());
            }
            case TEST_FAILED -> {
                var executions = executionService.listForRma(rmaId);
                br.com.navitasassist.protocol.ProtocolExecutionResponse execution;
                if (executions.isEmpty()) {
                    var item = new br.com.navitasassist.protocol.ProtocolTemplateItemRequest("Bancada", "Tensão", null,
                        br.com.navitasassist.protocol.ProtocolItemType.CHECK, true, null, null, null, null, null, false);
                    var template = templateService.create(new br.com.navitasassist.protocol.ProtocolTemplateRequest("Teste", product.getId(), null, true, Set.of(), List.of(item)));
                    execution = executionService.start(rmaId, template.id());
                } else {
                    execution = executions.get(0);
                }
                executionService.recordResult(execution.id(), execution.items().get(0).item().id(), new br.com.navitasassist.protocol.ProtocolItemResultRequest(
                    br.com.navitasassist.protocol.ProtocolItemOutcome.FAILED, null, null, null, "Fora do esperado", null));
            }
            default -> throw new IllegalArgumentException();
        }
        NotificationTestSupport.awaitIdle(notificationExecutor);
    }

    private Notification saveNotification(UserAccount recipient, NotificationEventType type, Instant snoozedUntil) {
        NotificationEvent event = new NotificationEvent();
        event.setEventKey("direct-" + type + "-" + System.nanoTime());
        event.setEventType(type);
        event.setStatus(NotificationEventStatus.PROCESSED);
        event.setOccurredAt(Instant.now());
        event = notificationEventRepository.save(event);
        Notification notification = new Notification();
        notification.setEvent(event);
        notification.setRecipient(recipient);
        notification.setEventType(type);
        notification.setSeverity(type.isSnoozable() ? NotificationSeverity.WARNING : NotificationSeverity.INFO);
        notification.setTitle("Teste " + type);
        notification.setMessage("Teste");
        notification.setCreatedAt(Instant.now());
        notification.setSnoozedUntil(snoozedUntil);
        return notificationRepository.save(notification);
    }

    private RmaDetailResponse createRma() {
        RmaDetailResponse created = rmaService.create(new CreateRmaRequest(client.getId(), List.of(new RmaItemRequest(product.getId(), null, "SER-NAV40-" + System.nanoTime(), null)), null, true,
            LocalDate.now(), null, "Não liga", null, null, RmaPriority.HIGH, null, null, null, null));
        NotificationTestSupport.awaitIdle(notificationExecutor);
        return created;
    }

    private UserAccount createUser(String username, String role, boolean active) {
        UserAccount account = new UserAccount();
        account.setUsername(username);
        account.setFullName(username);
        account.setPasswordHash("not-used");
        AccessTestSupport.assignProfile(accessProfiles, account, role);
        account.setActive(active);
        account = userAccountRepository.save(account);
        createdUserIds.add(account.getId());
        return account;
    }

    private UserAccount admin() {
        return userAccountRepository.findByUsernameIgnoreCase("admin").orElseThrow();
    }

    private RequestPostProcessor as(UserAccount account) {
        return asProfile(account.getUsername(), account.getProfile().getLegacyCode());
    }

    private long countFor(UserAccount account, NotificationEventType type) {
        return notificationRepository.findAll().stream().filter(notification -> notification.getRecipient().getId().equals(account.getId()) && notification.getEventType() == type).count();
    }

    private NotificationEvent eventFor(String key) {
        return notificationEventRepository.findAll().stream().filter(event -> event.getEventKey().equals(key)).findFirst().orElseThrow();
    }

    private Map<String, Object> rulePayload(boolean enabled, String severity, Set<String> legacyCodes) {
        return rulePayloadForProfiles(enabled, severity, legacyCodes.stream().map(code -> profile(code).getId()).toList());
    }

    private Map<String, Object> rulePayloadForProfiles(boolean enabled, String severity, List<Long> profileIds) {
        return Map.of("enabled", enabled, "severity", severity, "recipientProfileIds", profileIds, "notifyAssignee", false, "emailEnabled", false, "userMutable", true);
    }

    private AccessProfile profile(String legacyCode) {
        return accessProfiles.findByLegacyCode(legacyCode).orElseThrow();
    }

    private void resetRules() {
        for (NotificationEventType type : List.of(NotificationEventType.RMA_BLOCKED, NotificationEventType.PART_PENDING, NotificationEventType.TEST_FAILED)) {
            reset(type, NotificationSeverity.WARNING, Set.of("ADMIN"), type != NotificationEventType.PART_PENDING, true);
        }
        reset(NotificationEventType.RMA_CREATED, NotificationSeverity.INFO, Set.of("ADMIN", "SERVICE_DESK"), false, true);
        reset(NotificationEventType.RMA_ASSIGNED, NotificationSeverity.INFO, Set.of(), true, false);
    }

    private void reset(NotificationEventType type, NotificationSeverity severity, Set<String> roles, boolean notifyAssignee, boolean userMutable) {
        NotificationRule rule = notificationRuleRepository.findByEventType(type).orElseThrow();
        rule.setEnabled(true);
        rule.setAppEnabled(true);
        rule.setSeverity(severity);
        rule.setRecipientProfiles(new java.util.HashSet<>(roles.stream().map(role -> profile(role)).toList()));
        rule.setNotifyAssignee(notifyAssignee);
        rule.setEmailEnabled(false);
        rule.setUserMutable(userMutable);
        notificationRuleRepository.save(rule);
    }
}
