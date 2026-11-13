package br.com.navitasassist.notification;

import static br.com.navitasassist.access.AccessTestSupport.asProfile;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import br.com.navitasassist.access.AccessTestSupport;
import br.com.navitasassist.repository.AccessProfileRepository;
import br.com.navitasassist.client.Client;
import br.com.navitasassist.config.NotificationAsyncConfig;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.NotificationEventRepository;
import br.com.navitasassist.repository.NotificationRepository;
import br.com.navitasassist.repository.NotificationRuleRepository;
import br.com.navitasassist.repository.ProductRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.rma.CreateRmaRequest;
import br.com.navitasassist.rma.RmaItemRequest;
import br.com.navitasassist.rma.RmaPriority;
import br.com.navitasassist.rma.RmaResponse;
import br.com.navitasassist.service.RmaService;
import br.com.navitasassist.user.UserAccount;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = { "navitas.notifications.email.enabled=true", "navitas.notifications.email.from=from@example.invalid", "navitas.notifications.email.app-base-url=http://localhost:4200", "navitas.notifications.email.poll-ms=600000" })
class NotificationEmailIntegrationTest {

    @MockBean
    private br.com.navitasassist.notification.email.EmailProvider mailSender;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private RmaService rmaService;

    @Autowired
    private NotificationRepository notificationRepository;

    @Autowired
    private NotificationEventRepository notificationEventRepository;

    @Autowired
    private NotificationRuleRepository notificationRuleRepository;

    @Autowired
    private UserAccountRepository userAccountRepository;

    @Autowired
    private AccessProfileRepository accessProfiles;

    @Autowired
    private RmaRecordRepository rmaRecordRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private ClientRepository clientRepository;

    @Autowired
    @Qualifier(NotificationAsyncConfig.NOTIFICATION_EXECUTOR)
    private ThreadPoolTaskExecutor notificationExecutor;

    @Autowired private org.springframework.transaction.PlatformTransactionManager transactionManager;
    @Autowired private org.springframework.security.crypto.password.PasswordEncoder passwordEncoder;
    @Autowired private br.com.navitasassist.service.NotificationEmailWorker worker;
    @Autowired private br.com.navitasassist.config.NotificationProperties properties;
    @Autowired private br.com.navitasassist.service.NotificationEmailQueue queue;
    @org.springframework.boot.test.mock.mockito.SpyBean private br.com.navitasassist.service.NotificationEmailContentFactory contentFactory;
    @MockBean private java.time.Clock clock;
    private final java.time.Instant now = java.time.Instant.parse("2026-11-14T12:00:00Z");
    private UserAccount technician;
    private RmaResponse rma;

    @BeforeEach
    void setUp() {
        cleanUp();
        properties.getEmail().setEnabled(true);
        org.mockito.Mockito.when(clock.instant()).thenReturn(now);
        br.com.navitasassist.user.UserAccountTestSupport.ensureAdmin(userAccountRepository, accessProfiles, passwordEncoder);
        setAssignmentEmail(true);
        technician = new UserAccount();
        technician.setUsername("nav40-mail-tech");
        technician.setEmail("tech@example.invalid");
        technician.setFullName("Técnico e-mail");
        technician.setPasswordHash("not-used");
        AccessTestSupport.assignProfile(accessProfiles, technician, "TECHNICIAN");
        technician = userAccountRepository.save(technician);
        Client client = new Client();
        client.setLegalName("Cliente e-mail");
        client = clientRepository.save(client);
        Product product = new Product();
        product.setSku("SKU-NAV40-MAIL");
        product.setName("Produto e-mail");
        product = productRepository.save(product);
        rma = rmaService.create(new CreateRmaRequest(client.getId(), List.of(new RmaItemRequest(product.getId(), null, "SER-MAIL", null)), null, true, LocalDate.now(), null, "Falha", null, null, RmaPriority.LOW, null, null, null, null));
        NotificationTestSupport.awaitIdle(notificationExecutor);
        reset(mailSender);
        org.mockito.Mockito.when(mailSender.send(any(), any())).thenReturn(new br.com.navitasassist.notification.email.EmailSendResult("accepted"));
    }

    @AfterEach
    void cleanUp() {
        notificationRepository.deleteAll();
        notificationEventRepository.deleteAll();
        rmaRecordRepository.deleteAll();
        productRepository.deleteAll();
        clientRepository.deleteAll();
        userAccountRepository.findAll().stream().filter(account -> account.getUsername().startsWith("nav40-")).forEach(userAccountRepository::delete);
        setAssignmentEmail(false);
    }

    @Test
    void queuesAndSendsWithFixedNotificationKeyWithoutWaitingInRmaRequest() throws Exception {
        assignAndWait().andExpect(status().isOk());
        Notification notification = assignmentNotification();
        assertEquals(NotificationEmailStatus.PENDING, notification.getEmailStatus());
        worker.poll();
        assertEquals(NotificationEmailStatus.SENT, assignmentNotification().getEmailStatus());
        verify(mailSender).send(any(), org.mockito.ArgumentMatchers.eq(notification.getId().toString()));
    }

    @Test
    void transientFailuresRetryAtExactIntervalsThenFailWithoutUndoingRma() throws Exception {
        doThrow(new br.com.navitasassist.notification.email.EmailDeliveryException("HTTP_503", true)).when(mailSender).send(any(), any());
        assignAndWait().andExpect(status().isOk());
        java.time.Instant attemptTime = now;
        int[] minutes = {1, 5, 30, 120};
        for (int attempt = 1; attempt <= 5; attempt++) {
            org.mockito.Mockito.when(clock.instant()).thenReturn(attemptTime);
            worker.poll();
            Notification notification = assignmentNotification();
            assertEquals(attempt, notification.getEmailAttempts());
            if (attempt < 5) {
                attemptTime = attemptTime.plusSeconds(minutes[attempt - 1] * 60L);
                assertEquals(attemptTime, notification.getEmailNextAttemptAt());
                assertEquals(NotificationEmailStatus.PENDING, notification.getEmailStatus());
            } else assertEquals(NotificationEmailStatus.FAILED, notification.getEmailStatus());
        }
        assertEquals(technician.getId(), rmaRecordRepository.findById(rma.id()).orElseThrow().getAssignee().getId());
        mockMvc.perform(get("/api/notifications").with(asProfile("nav40-mail-tech", "TECHNICIAN"))).andExpect(jsonPath("$[0].eventType").value("RMA_ASSIGNED"));
    }

    @Test
    void disabledPausesPendingAndRevokedRuleCancelsWithoutSending() throws Exception {
        assignAndWait();
        properties.getEmail().setEnabled(false);
        worker.poll();
        assertEquals(0, assignmentNotification().getEmailAttempts());
        assertEquals(NotificationEmailStatus.PENDING, assignmentNotification().getEmailStatus());
        properties.getEmail().setEnabled(true);
        setAssignmentEmail(false);
        worker.poll();
        assertEquals(NotificationEmailStatus.NOT_REQUESTED, assignmentNotification().getEmailStatus());
        org.mockito.Mockito.verifyNoInteractions(mailSender);
    }

    @Test
    void emailOnlyIsAbsentFromInboxSummaryAndPersonalActions() throws Exception {
        NotificationRule rule = notificationRuleRepository.findByEventType(NotificationEventType.RMA_ASSIGNED).orElseThrow();
        rule.setAppEnabled(false);
        notificationRuleRepository.save(rule);
        assignAndWait();
        assertFalse(assignmentNotification().isAppVisible());
        mockMvc.perform(get("/api/notifications").with(asProfile("nav40-mail-tech", "TECHNICIAN"))).andExpect(jsonPath("$[?(@.eventType == 'RMA_ASSIGNED')]").isEmpty());
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/notifications/{id}/read", assignmentNotification().getId()).with(asProfile("nav40-mail-tech", "TECHNICIAN")).with(csrf())).andExpect(status().isNotFound());
    }

    @Test
    void restartAfterLastPersistedAttemptDoesNotSendSixthAttempt() throws Exception {
        assignAndWait();
        Notification n = assignmentNotification();
        n.setEmailAttempts(5);
        notificationRepository.saveAndFlush(n);
        worker.poll();
        assertEquals(NotificationEmailStatus.FAILED, assignmentNotification().getEmailStatus());
        org.mockito.Mockito.verifyNoInteractions(mailSender);
    }

    @Test
    void testEmailIsImmediateForSelfThrottledAndNeverStored() throws Exception {
        technician.setExtraPermissions(new java.util.HashSet<>(java.util.Set.of("notificacoes.regras")));
        userAccountRepository.saveAndFlush(technician);
        long count = notificationRepository.count();
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/notification-rules/emails/test").with(user(technician.getUsername()).authorities(org.springframework.security.core.authority.AuthorityUtils.createAuthorityList("notificacoes.regras"))).with(csrf()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("simulado"));
        assertEquals(count, notificationRepository.count());
        var message = org.mockito.ArgumentCaptor.forClass(br.com.navitasassist.notification.email.EmailMessage.class);
        verify(mailSender).send(message.capture(), any());
        assertEquals("tech@example.invalid", message.getValue().to());
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/notification-rules/emails/test").with(user(technician.getUsername()).authorities(org.springframework.security.core.authority.AuthorityUtils.createAuthorityList("notificacoes.regras"))).with(csrf()))
            .andExpect(status().isTooManyRequests());
    }

    @Test
    void retryOnlyFailedAndRevalidatesEligibilityWithoutCreatingAnotherAppNotification() throws Exception {
        assignAndWait();
        Long id = assignmentNotification().getId();
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/notification-rules/emails/{id}/retry", id).with(asProfile("admin", "ADMIN")).with(csrf()))
            .andExpect(status().isConflict());
        doThrow(new br.com.navitasassist.notification.email.EmailDeliveryException("HTTP_400", false)).when(mailSender).send(any(), any());
        worker.poll();
        assertEquals(NotificationEmailStatus.FAILED, assignmentNotification().getEmailStatus());
        long count = notificationRepository.count();
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/notification-rules/emails/{id}/retry", id).with(asProfile("admin", "ADMIN")).with(csrf()))
            .andExpect(status().isAccepted()).andExpect(jsonPath("$.status").value("PENDING"));
        assertEquals(count, notificationRepository.count());
        assertEquals(0, assignmentNotification().getEmailAttempts());
        mockMvc.perform(get("/api/notification-rules/email-status").with(asProfile("admin", "ADMIN")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.enabled").value(true)).andExpect(jsonPath("$.provider").value("fake"));
    }

    @Test
    void testEmailRejectsForeignRecipientsAndRequiresCsrfAndPermission() throws Exception {
        var request = org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/notification-rules/emails/test");
        mockMvc.perform(request.with(csrf())).andExpect(status().isUnauthorized());
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/notification-rules/emails/test").with(asProfile(technician.getUsername(), "TECHNICIAN")).with(csrf())).andExpect(status().isForbidden());
        technician.setExtraPermissions(new java.util.HashSet<>(java.util.Set.of("notificacoes.regras")));
        userAccountRepository.saveAndFlush(technician);
        var privileged = user(technician.getUsername()).authorities(org.springframework.security.core.authority.AuthorityUtils.createAuthorityList("notificacoes.regras"));
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/notification-rules/emails/test").with(privileged)).andExpect(status().isForbidden());
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/notification-rules/emails/test").with(privileged).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"to\":\"foreign@example.invalid\"}"))
            .andExpect(status().isBadRequest());
        org.mockito.Mockito.verifyNoInteractions(mailSender);
    }

    @Test
    void testFailureIsSafe502AndNeverCreatesNotification() throws Exception {
        technician.setExtraPermissions(new java.util.HashSet<>(java.util.Set.of("notificacoes.regras")));
        userAccountRepository.saveAndFlush(technician);
        doThrow(new IllegalStateException("secret-key tech@example.invalid")).when(mailSender).send(any(), any());
        long count = notificationRepository.count();
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/notification-rules/emails/test")
            .with(user(technician.getUsername()).authorities(org.springframework.security.core.authority.AuthorityUtils.createAuthorityList("notificacoes.regras"))).with(csrf()))
            .andExpect(status().isBadGateway()).andExpect(jsonPath("$.message").value("Email provider could not accept the test."));
        assertEquals(count, notificationRepository.count());
    }

    @Test
    void workerUsesCurrentEmailAndCancelsInactiveRecipient() throws Exception {
        assignAndWait();
        technician.setEmail("current@example.invalid");
        userAccountRepository.saveAndFlush(technician);
        worker.poll();
        var message = org.mockito.ArgumentCaptor.forClass(br.com.navitasassist.notification.email.EmailMessage.class);
        verify(mailSender).send(message.capture(), any());
        assertEquals("current@example.invalid", message.getValue().to());
        Notification n = assignmentNotification();
        n.setEmailStatus(NotificationEmailStatus.PENDING); n.setEmailNextAttemptAt(now);
        notificationRepository.saveAndFlush(n);
        technician.setActive(false); userAccountRepository.saveAndFlush(technician);
        reset(mailSender);
        worker.poll();
        assertEquals(NotificationEmailStatus.NOT_REQUESTED, assignmentNotification().getEmailStatus());
        org.mockito.Mockito.verifyNoInteractions(mailSender);
    }

    @Test
    void concurrentRetriesAcceptOnlyOneTransition() throws Exception {
        assignAndWait();
        Notification n = assignmentNotification();
        n.setEmailStatus(NotificationEmailStatus.FAILED); notificationRepository.saveAndFlush(n);
        java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(2);
        java.util.concurrent.CountDownLatch start = new java.util.concurrent.CountDownLatch(1);
        try {
            java.util.concurrent.Callable<Integer> retry = () -> {
                start.await();
                return mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/notification-rules/emails/{id}/retry", n.getId()).with(asProfile("admin", "ADMIN")).with(csrf())).andReturn().getResponse().getStatus();
            };
            var first = pool.submit(retry); var second = pool.submit(retry); start.countDown();
            assertEquals(java.util.Set.of(202, 409), java.util.Set.of(first.get(10, java.util.concurrent.TimeUnit.SECONDS), second.get(10, java.util.concurrent.TimeUnit.SECONDS)));
        } finally { pool.shutdownNow(); }
    }

    @Test
    void twoInstancesPreparingTheSameDueEmailReserveItOnlyOnce() throws Exception {
        assignAndWait();
        Long id = assignmentNotification().getId();
        var firstBuilding = new java.util.concurrent.CountDownLatch(1);
        var release = new java.util.concurrent.CountDownLatch(1);
        var calls = new java.util.concurrent.atomic.AtomicInteger();
        doAnswer(invocation -> {
            if (calls.incrementAndGet() == 1) {
                firstBuilding.countDown();
                assertTrue(release.await(10, java.util.concurrent.TimeUnit.SECONDS));
            }
            return invocation.callRealMethod();
        }).when(contentFactory).build(any(), any());
        var pool = java.util.concurrent.Executors.newSingleThreadExecutor();
        try {
            // A primeira instância leu a linha devida e para antes de reservar; a segunda lê a mesma linha e reserva.
            var first = pool.submit(() -> queue.prepare(id));
            assertTrue(firstBuilding.await(10, java.util.concurrent.TimeUnit.SECONDS));
            var second = queue.prepare(id);
            release.countDown();
            var stale = first.get(10, java.util.concurrent.TimeUnit.SECONDS);
            org.junit.jupiter.api.Assertions.assertNotNull(second);
            org.junit.jupiter.api.Assertions.assertNull(stale);
            Notification n = assignmentNotification();
            assertEquals(1, n.getEmailAttempts());
            assertEquals(NotificationEmailStatus.PENDING, n.getEmailStatus());
            assertTrue(n.getEmailNextAttemptAt().isAfter(now));
        } finally { release.countDown(); pool.shutdownNow(); }
        // Reservada, a linha não volta a ser devida no mesmo instante: outra varredura não a envia.
        worker.poll();
        org.mockito.Mockito.verifyNoInteractions(mailSender);
    }

    @Test
    void concurrentPersonalReadDoesNotRestorePendingAfterWorkerSent() throws Exception {
        assignAndWait();
        Long id = assignmentNotification().getId();
        var loaded = new java.util.concurrent.CountDownLatch(1);
        var sent = new java.util.concurrent.CountDownLatch(1);
        var pool = java.util.concurrent.Executors.newSingleThreadExecutor();
        try {
            var read = pool.submit(() -> new org.springframework.transaction.support.TransactionTemplate(transactionManager).execute(ignored -> {
                Notification n = notificationRepository.findById(id).orElseThrow();
                n.setReadAt(now);
                loaded.countDown();
                try { assertTrue(sent.await(10, java.util.concurrent.TimeUnit.SECONDS)); }
                catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new RuntimeException(error); }
                return null;
            }));
            assertTrue(loaded.await(10, java.util.concurrent.TimeUnit.SECONDS));
            worker.poll();
            sent.countDown();
            read.get(10, java.util.concurrent.TimeUnit.SECONDS);
            assertEquals(NotificationEmailStatus.SENT, assignmentNotification().getEmailStatus());
            assertEquals(now, assignmentNotification().getReadAt());
        } finally { sent.countDown(); pool.shutdownNow(); }
    }

    private org.springframework.test.web.servlet.ResultActions assignAndWait() throws Exception {
        org.springframework.test.web.servlet.ResultActions result = assign();
        NotificationTestSupport.awaitIdle(notificationExecutor);
        return result;
    }

    private org.springframework.test.web.servlet.ResultActions assign() throws Exception {
        return mockMvc.perform(patch("/api/rmas/{id}/assignee", rma.id()).with(asProfile("admin", "ADMIN")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(Map.of("assigneeId", technician.getId()))));
    }

    private Notification assignmentNotification() {
        return notificationRepository.findAll().stream().filter(notification -> notification.getEventType() == NotificationEventType.RMA_ASSIGNED).findFirst().orElseThrow();
    }

    private void setAssignmentEmail(boolean enabled) {
        NotificationRule rule = notificationRuleRepository.findByEventType(NotificationEventType.RMA_ASSIGNED).orElseThrow();
        rule.setEmailEnabled(enabled);
        rule.setAppEnabled(true);
        notificationRuleRepository.save(rule);
    }
}
