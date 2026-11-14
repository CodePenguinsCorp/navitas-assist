package br.com.navitasassist.access;

import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.hasItem;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import java.util.TreeSet;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import br.com.navitasassist.auth.NavitasUserDetailsService;
import br.com.navitasassist.notification.Notification;
import br.com.navitasassist.notification.NotificationEvent;
import br.com.navitasassist.notification.NotificationEventStatus;
import br.com.navitasassist.notification.NotificationEventType;
import br.com.navitasassist.notification.NotificationSeverity;
import br.com.navitasassist.repository.AccessProfileRepository;
import br.com.navitasassist.repository.NotificationEventRepository;
import br.com.navitasassist.repository.NotificationRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.user.UserAccount;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class EffectivePermissionIntegrationTest {

    private static final String VIEWER_EXTRA = "effective.viewer.extra";
    private static final String REPORTS_ONLY = "effective.reports.only";
    private static final String REPORTS_PROFILE = "Teste efetivo: só relatórios";

    @Autowired private MockMvc mvc;
    @Autowired private NavitasUserDetailsService userDetailsService;
    @Autowired private UserAccountRepository users;
    @Autowired private AccessProfileRepository profiles;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private NotificationRepository notifications;
    @Autowired private NotificationEventRepository events;

    @BeforeEach
    void prepare() {
        cleanup();
        AccessProfile viewer = profiles.findByLegacyCode("VIEWER").orElseThrow();
        AccessTestSupport.saveAccountWithProfile(users, passwordEncoder, VIEWER_EXTRA, viewer, Set.of("rma.abrir"));
        AccessProfile reportsOnly = AccessTestSupport.saveProfile(profiles, REPORTS_PROFILE, "relatorios.ver");
        AccessTestSupport.saveAccountWithProfile(users, passwordEncoder, REPORTS_ONLY, reportsOnly, Set.of());
    }

    @AfterEach
    void cleanup() {
        Set<Long> ownUsers = Stream.of(VIEWER_EXTRA, REPORTS_ONLY)
            .flatMap(username -> users.findByUsernameIgnoreCase(username).stream())
            .map(UserAccount::getId).collect(Collectors.toSet());
        notifications.findAll().stream()
            .filter(notification -> ownUsers.contains(notification.getRecipient().getId()))
            .forEach(notifications::delete);
        notifications.flush();
        events.findAll().stream().filter(event -> event.getEventKey().startsWith("effective-")).forEach(events::delete);
        events.flush();
        AccessTestSupport.deleteAccounts(users, VIEWER_EXTRA, REPORTS_ONLY);
        AccessTestSupport.deleteProfiles(profiles, REPORTS_PROFILE);
    }

    @Test
    void viewerWithExtraCanOpenRma() throws Exception {
        int status = mvc.perform(post("/api/rmas").with(as(VIEWER_EXTRA)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andReturn().getResponse().getStatus();

        assertTrue(status != 401 && status != 403, "Consulta + extra rma.abrir deveria abrir OS, mas recebeu " + status);
        mvc.perform(putJson("/api/rmas/999999").with(as(VIEWER_EXTRA)))
            .andExpect(status().isForbidden());
    }

    @Test
    void customProfileOnlyReports() throws Exception {
        mvc.perform(get("/api/reports/rmas").with(as(REPORTS_ONLY))).andExpect(status().isOk());
        mvc.perform(get("/api/rmas").with(as(REPORTS_ONLY))).andExpect(status().isForbidden());
        // D2: as leituras auxiliares continuam abertas a qualquer usuário autenticado.
        mvc.perform(get("/api/clients").with(as(REPORTS_ONLY))).andExpect(status().isOk());
        mvc.perform(get("/api/parts").with(as(REPORTS_ONLY))).andExpect(status().isOk());
        mvc.perform(get("/api/protocols/templates").with(as(REPORTS_ONLY))).andExpect(status().isOk());
    }

    @Test
    void customProfileWithoutRmaVerSeesNoNotifications() throws Exception {
        mvc.perform(get("/api/notifications/preferences").with(as(VIEWER_EXTRA)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(greaterThan(0)));
        mvc.perform(get("/api/notifications/preferences").with(as(REPORTS_ONLY)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/notifications/summary").with(as(REPORTS_ONLY)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.unread").value(0));
    }

    /** D5: uma notificação real do usuário sem rma.ver some da lista, do resumo e das ações por id. */
    @Test
    void customProfileWithoutRmaVerCannotSeeItsOwnNotification() throws Exception {
        Notification hidden = saveNotification(REPORTS_ONLY);
        Notification visible = saveNotification(VIEWER_EXTRA);

        mvc.perform(get("/api/notifications").with(as(VIEWER_EXTRA)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[*].id", hasItem(visible.getId().intValue())));
        mvc.perform(get("/api/notifications/summary").with(as(VIEWER_EXTRA)))
            .andExpect(jsonPath("$.unread").value(greaterThan(0)));

        mvc.perform(get("/api/notifications").with(as(REPORTS_ONLY)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/notifications").param("unreadOnly", "false").param("includeSnoozed", "true").with(as(REPORTS_ONLY)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/notifications/summary").with(as(REPORTS_ONLY)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.unread").value(0));
        mvc.perform(post("/api/notifications/{id}/read", hidden.getId()).with(as(REPORTS_ONLY)).with(csrf()))
            .andExpect(status().isNotFound());
        mvc.perform(post("/api/notifications/{id}/snooze", hidden.getId()).with(as(REPORTS_ONLY)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"minutes\":60}"))
            .andExpect(status().isNotFound());
        assertNull(notifications.findById(hidden.getId()).orElseThrow().getReadAt());
    }

    private Notification saveNotification(String username) {
        NotificationEvent event = new NotificationEvent();
        event.setEventKey("effective-" + username + "-" + UUID.randomUUID());
        event.setEventType(NotificationEventType.RMA_CREATED);
        event.setStatus(NotificationEventStatus.PROCESSED);
        event.setRecipientCount(1);
        event.setOccurredAt(Instant.now());
        event = events.saveAndFlush(event);
        Notification notification = new Notification();
        notification.setEvent(event);
        notification.setRecipient(users.findByUsernameIgnoreCase(username).orElseThrow());
        notification.setEventType(NotificationEventType.RMA_CREATED);
        notification.setSeverity(NotificationSeverity.INFO);
        notification.setTitle("OS aberta");
        notification.setMessage("Notificação de teste");
        notification.setCreatedAt(Instant.now());
        return notifications.saveAndFlush(notification);
    }

    @Test
    void authoritiesAreExactlyEffectiveCodes() {
        assertEquals(new TreeSet<>(Set.of("rma.ver", "cadastros.ver", "pecas.ver", "protocolos.ver", "relatorios.ver", "rma.abrir")),
            authorities(VIEWER_EXTRA));
        assertEquals(Set.of("relatorios.ver"), authorities(REPORTS_ONLY));
    }

    @Test
    void legacyProfilesMatchMigratedSeed() {
        assertEquals(Set.of("ADMIN", "SERVICE_DESK", "TECHNICIAN", "VIEWER"), LegacyProfiles.PERMISSIONS.keySet());
        LegacyProfiles.PERMISSIONS.forEach((code, expected) ->
            assertEquals(expected, profiles.findByLegacyCode(code).orElseThrow().getPermissions(), "Seed do perfil " + code));
    }

    private Set<String> authorities(String username) {
        UserDetails details = userDetailsService.loadUserByUsername(username);
        return details.getAuthorities().stream().map(GrantedAuthority::getAuthority).collect(Collectors.toCollection(TreeSet::new));
    }

    private RequestPostProcessor as(String username) {
        return user(userDetailsService.loadUserByUsername(username));
    }

    private static MockHttpServletRequestBuilder putJson(String path) {
        return MockMvcRequestBuilders.put(path).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}");
    }
}
