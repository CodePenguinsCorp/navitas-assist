package br.com.navitasassist.notification;

import static br.com.navitasassist.access.AccessTestSupport.asProfile;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import br.com.navitasassist.access.AccessTestSupport;
import br.com.navitasassist.repository.AccessProfileRepository;
import br.com.navitasassist.repository.NotificationEventRepository;
import br.com.navitasassist.repository.NotificationRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.user.UserAccount;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class NotificationReadBatchIntegrationTest {

    private static final Instant NOW = Instant.parse("2026-11-12T12:00:00Z");
    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper json;
    @Autowired private NotificationRepository notifications;
    @Autowired private NotificationEventRepository events;
    @Autowired private UserAccountRepository users;
    @Autowired private AccessProfileRepository profiles;
    @Autowired private PasswordEncoder passwords;
    @Autowired private TransactionTemplate transactions;
    @Autowired private EntityManager entityManager;
    @MockBean private Clock clock;
    private UserAccount owner;
    private UserAccount other;

    @BeforeEach
    void setUp() {
        when(clock.instant()).thenReturn(NOW);
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        owner = AccessTestSupport.saveAccount(users, profiles, passwords, "batch-" + suffix, "ADMIN");
        other = AccessTestSupport.saveAccount(users, profiles, passwords, "other-" + suffix, "ADMIN");
    }

    @Test
    void countsAndRestoresAllChangedRowsIncludingSnoozedAndBeyondThePage() throws Exception {
        for (int i = 0; i < 105; i++) notification(owner, false, i == 104);
        Notification alreadyRead = notification(owner, true, false);
        Notification foreign = notification(other, false, false);
        mvc.perform(get("/api/notifications").with(asProfile(owner.getUsername(), "ADMIN")))
            .andExpect(jsonPath("$.length()").value(100))
            .andExpect(jsonPath("$[0].id").value(alreadyRead.getId()));

        JsonNode batch = markAll(owner);
        assertEquals(105, batch.path("markedCount").asInt());
        assertEquals(NOW.plusSeconds(4), Instant.parse(batch.path("expiresAt").asText()));
        assertEquals(106, ownRows().stream().filter(n -> n.getReadAt() != null).count());
        Notification arrivedLater = notification(owner, false, false);
        when(clock.instant()).thenReturn(NOW.plusMillis(3999));

        batchAction("undo", owner, batch.path("undoToken").asText())
            .andExpect(status().isOk()).andExpect(jsonPath("$.restoredCount").value(105));
        assertNotNull(notifications.findById(alreadyRead.getId()).orElseThrow().getReadAt());
        assertNull(notifications.findById(arrivedLater.getId()).orElseThrow().getReadAt());
        assertNull(notifications.findById(foreign.getId()).orElseThrow().getReadAt());
        assertEquals(1, ownRows().stream().filter(n -> n.getReadAt() != null).count());
        assertNotNull(ownRows().stream().filter(n -> n.getSnoozedUntil() != null).findFirst().orElseThrow().getSnoozedUntil());
        batchAction("undo", owner, batch.path("undoToken").asText()).andExpect(status().isBadRequest());
    }

    @ParameterizedTest
    @ValueSource(longs = {4000, 4001})
    void rejectsUndoAtAndAfterTheFourSecondBoundary(long elapsed) throws Exception {
        Notification row = notification(owner, false, false);
        JsonNode batch = markAll(owner);
        when(clock.instant()).thenReturn(NOW.plusMillis(elapsed));
        batchAction("undo", owner, batch.path("undoToken").asText()).andExpect(status().isBadRequest());
        assertNotNull(notifications.findById(row.getId()).orElseThrow().getReadAt());
    }

    @Test
    void globalBatchStillMarksUnreadWhenAllAreSnoozedAndTheVisibleSummaryIsZero() throws Exception {
        Notification hidden = notification(owner, false, true);
        mvc.perform(get("/api/notifications").with(asProfile(owner.getUsername(), "ADMIN")))
            .andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/notifications/summary").with(asProfile(owner.getUsername(), "ADMIN")))
            .andExpect(jsonPath("$.unread").value(0));
        assertEquals(1, markAll(owner).path("markedCount").asInt());
        assertNotNull(notifications.findById(hidden.getId()).orElseThrow().getReadAt());
    }

    @Test
    void newerBatchSupersedesOldEvenWhenItMarksZeroRows() throws Exception {
        Notification first = notification(owner, false, false);
        JsonNode old = markAll(owner);
        Notification second = notification(owner, false, false);
        JsonNode latest = markAll(owner);
        batchAction("undo", owner, old.path("undoToken").asText()).andExpect(status().isBadRequest());
        batchAction("dismiss", owner, old.path("undoToken").asText()).andExpect(status().isNoContent());
        batchAction("undo", owner, latest.path("undoToken").asText())
            .andExpect(status().isOk()).andExpect(jsonPath("$.restoredCount").value(1));
        assertNotNull(notifications.findById(first.getId()).orElseThrow().getReadAt());
        assertNull(notifications.findById(second.getId()).orElseThrow().getReadAt());

        JsonNode last = markAll(owner);
        JsonNode empty = markAll(owner);
        assertEquals(0, empty.path("markedCount").asInt());
        assertTrue(empty.path("undoToken").isNull());
        assertTrue(empty.path("expiresAt").isNull());
        batchAction("undo", owner, last.path("undoToken").asText()).andExpect(status().isBadRequest());
    }

    @Test
    void dismissEndsEligibilityAndCannotDismissOrUndoAnotherUsersBatch() throws Exception {
        notification(owner, false, false);
        String token = markAll(owner).path("undoToken").asText();
        batchAction("undo", other, token).andExpect(status().isBadRequest());
        batchAction("dismiss", other, token).andExpect(status().isNoContent());
        batchAction("undo", owner, token).andExpect(status().isOk());

        token = markAll(owner).path("undoToken").asText();
        batchAction("dismiss", owner, token).andExpect(status().isNoContent());
        batchAction("dismiss", owner, token).andExpect(status().isNoContent());
        batchAction("undo", owner, token).andExpect(status().isBadRequest());
        assertEquals(1, ownRows().stream().filter(n -> n.getReadAt() != null).count());
    }

    @Test
    void explicitReadAfterBatchIsPreservedWhenUndoingTheRemainingRows() throws Exception {
        Notification opened = notification(owner, false, false);
        Notification untouched = notification(owner, false, false);
        String token = markAll(owner).path("undoToken").asText();
        mvc.perform(post("/api/notifications/{id}/read", opened.getId())
            .with(asProfile(owner.getUsername(), "ADMIN")).with(csrf())).andExpect(status().isOk());
        batchAction("undo", owner, token).andExpect(status().isOk()).andExpect(jsonPath("$.restoredCount").value(1));
        assertNotNull(notifications.findById(opened.getId()).orElseThrow().getReadAt());
        assertNull(notifications.findById(untouched.getId()).orElseThrow().getReadAt());
    }

    @Test
    void protectsAllBatchOperationsWithAuthenticationCsrfAndTokenValidation() throws Exception {
        for (String path : List.of("/read-all", "/read-all/undo", "/read-all/dismiss")) {
            mvc.perform(post("/api/notifications" + path).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
            mvc.perform(post("/api/notifications" + path).with(asProfile(owner.getUsername(), "ADMIN"))
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        }
        for (String action : List.of("undo", "dismiss")) {
            for (String body : List.of("{}", "{\"token\":null}", "{\"token\":\"not-a-uuid\"}")) {
                mvc.perform(post("/api/notifications/read-all/" + action).with(asProfile(owner.getUsername(), "ADMIN")).with(csrf())
                    .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
            }
        }
    }

    @Test
    void simultaneousMarkAllOperationsHaveOnlyOneWinnerAndNoStaleUndo() throws Exception {
        notification(owner, false, false);
        CountDownLatch start = new CountDownLatch(1);
        var first = CompletableFuture.supplyAsync(() -> concurrentMarkAll(start));
        var second = CompletableFuture.supplyAsync(() -> concurrentMarkAll(start));
        start.countDown();
        JsonNode a = first.get(15, TimeUnit.SECONDS);
        JsonNode b = second.get(15, TimeUnit.SECONDS);
        assertEquals(1, a.path("markedCount").asInt() + b.path("markedCount").asInt());
        String supersededToken = (a.path("markedCount").asInt() == 1 ? a : b).path("undoToken").asText();
        batchAction("undo", owner, supersededToken).andExpect(status().isBadRequest());
        assertNotNull(ownRows().get(0).getReadAt());
    }

    @ParameterizedTest
    @ValueSource(strings = {"email", "snooze"})
    void staleUpdatesToOtherFieldsDoNotEraseTheReadBatch(String field) throws Exception {
        Notification row = notification(owner, false, false);
        CountDownLatch loaded = new CountDownLatch(1);
        CountDownLatch proceed = new CountDownLatch(1);
        var update = CompletableFuture.runAsync(() -> transactions.executeWithoutResult(status -> {
            Notification stale = entityManager.find(Notification.class, row.getId());
            loaded.countDown();
            await(proceed);
            if (field.equals("email")) stale.setEmailStatus(NotificationEmailStatus.SENT);
            else stale.setSnoozedUntil(NOW.plusSeconds(3600));
        }));
        assertTrue(loaded.await(10, TimeUnit.SECONDS));
        JsonNode batch;
        try { batch = markAll(owner); } finally { proceed.countDown(); }
        update.get(15, TimeUnit.SECONDS);
        assertNotNull(notifications.findById(row.getId()).orElseThrow().getReadAt());
        batchAction("undo", owner, batch.path("undoToken").asText()).andExpect(status().isOk())
            .andExpect(jsonPath("$.restoredCount").value(1));
        Notification restored = notifications.findById(row.getId()).orElseThrow();
        if (field.equals("email")) assertEquals(NotificationEmailStatus.SENT, restored.getEmailStatus());
        else assertEquals(NOW.plusSeconds(3600), restored.getSnoozedUntil());
    }

    private JsonNode concurrentMarkAll(CountDownLatch start) {
        await(start);
        try { return markAll(owner); } catch (Exception exception) { throw new RuntimeException(exception); }
    }

    private static void await(CountDownLatch latch) {
        try { assertTrue(latch.await(10, TimeUnit.SECONDS)); }
        catch (InterruptedException exception) { Thread.currentThread().interrupt(); throw new RuntimeException(exception); }
    }

    private JsonNode markAll(UserAccount account) throws Exception {
        return json.readTree(mvc.perform(post("/api/notifications/read-all")
            .with(asProfile(account.getUsername(), "ADMIN")).with(csrf()))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private ResultActions batchAction(String action, UserAccount account, String token) throws Exception {
        return mvc.perform(post("/api/notifications/read-all/" + action)
            .with(asProfile(account.getUsername(), "ADMIN")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(java.util.Map.of("token", token))));
    }

    private List<Notification> ownRows() {
        return notifications.findAll().stream().filter(n -> n.getRecipient().getId().equals(owner.getId())).toList();
    }

    private Notification notification(UserAccount recipient, boolean read, boolean snoozed) {
        NotificationEvent event = new NotificationEvent();
        event.setEventKey(UUID.randomUUID().toString());
        event.setEventType(NotificationEventType.RMA_CREATED);
        event.setStatus(NotificationEventStatus.PROCESSED);
        event.setOccurredAt(NOW);
        event = events.saveAndFlush(event);
        Notification notification = new Notification();
        notification.setEvent(event);
        notification.setRecipient(recipient);
        notification.setEventType(NotificationEventType.RMA_CREATED);
        notification.setSeverity(NotificationSeverity.INFO);
        notification.setTitle("Notification batch test");
        notification.setMessage("Batch test");
        notification.setCreatedAt(NOW);
        if (read) notification.setReadAt(NOW.minusSeconds(60));
        if (snoozed) notification.setSnoozedUntil(Instant.now().plusSeconds(3600));
        return notifications.saveAndFlush(notification);
    }
}
