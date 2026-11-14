package br.com.navitasassist.audit;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import br.com.navitasassist.client.ClientRequest;
import br.com.navitasassist.service.ClientService;
import br.com.navitasassist.service.AuditService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test") @Transactional
class AuditIntegrationTest {
    @Autowired ClientService clients;
    @Autowired AuditService audit;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @Autowired org.springframework.transaction.PlatformTransactionManager transactions;
    @Autowired br.com.navitasassist.service.ProductService products;
    @Autowired br.com.navitasassist.service.AccessProfileService profilesService;
    @Autowired br.com.navitasassist.service.UserAccountService usersService;
    @Autowired br.com.navitasassist.repository.UserAccountRepository users;
    @Autowired br.com.navitasassist.repository.AccessProfileRepository profiles;
    @Autowired org.springframework.security.crypto.password.PasswordEncoder passwords;

    @Test @WithMockUser(username="session.actor")
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED)
    void auditInsertFailureRollsBackBusinessWrite() {
        jdbc.execute("alter table audit_events add constraint ck_audit_test check (entity_label <> 'Audit must roll back')");
        try {
            assertThatThrownBy(() -> clients.create(new ClientRequest("Audit must roll back", null, null, null, null, null, null))).isInstanceOf(RuntimeException.class);
            assertThat(jdbc.queryForObject("select count(*) from clients where legal_name = 'Audit must roll back'", Long.class)).isZero();
        } finally { jdbc.execute("alter table audit_events drop constraint ck_audit_test"); }
    }

    @Test @WithMockUser(username="session.actor")
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED)
    void businessFailureRollsBackItsAuditWrite() {
        assertThatThrownBy(() -> new org.springframework.transaction.support.TransactionTemplate(transactions).execute(status -> {
            clients.create(new ClientRequest("Audit business rollback", null, null, null, null, null, null));
            throw new IllegalStateException("business failure");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(jdbc.queryForObject("select count(*) from clients where legal_name = 'Audit business rollback'", Long.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from audit_events where entity_label = 'Audit business rollback'", Long.class)).isZero();
    }

    @Test @WithMockUser(username="session.actor")
    void profileAndUserEventsTakeActorFromSessionAndDoNotExposePersonalValues() {
        br.com.navitasassist.user.UserAccountTestSupport.ensureAdmin(users, profiles, passwords);
        var profile = profilesService.create(new br.com.navitasassist.access.ProfileRequest("Audit profile", java.util.Set.of("cadastros.ver")), "admin");
        profilesService.update(profile.id(), new br.com.navitasassist.access.ProfileRequest("Audit profile changed", java.util.Set.of("rma.ver")), "admin");
        var user = usersService.create(new br.com.navitasassist.user.UserAccountRequest("audit.target", "Private Full Name", "secret123", profile.id(), java.util.Set.of(), true, "private@example.com"), "admin");
        usersService.update(user.id(), new br.com.navitasassist.user.UserAccountUpdateRequest("audit.target", "Another Private Name", "changed123", profile.id(), java.util.Set.of("cadastros.ver"), false, java.util.Optional.of("changed@example.com")), "admin");
        usersService.delete(user.id(), "admin");
        profilesService.delete(profile.id(), "admin");
        var events = jdbc.queryForList("select actor_username, summary from audit_events where actor_username = 'session.actor' and entity_type in ('USER','ACCESS_PROFILE')");
        assertThat(events).hasSize(9);
        assertThat(events).allSatisfy(event -> {
            assertThat(event.get("actor_username")).isEqualTo("session.actor");
            assertThat(event.get("summary").toString()).doesNotContain("Private Full Name", "private@example.com", "secret123", "changed123", "changed@example.com", "Another Private Name");
        });
        assertThat(events.toString()).contains("Permissão adicionada: rma.ver", "Permissão removida: cadastros.ver", "E-mail alterado.", "Senha alterada.", "Usuário desativado.");
    }

    @Test @WithMockUser(username="session.actor")
    void extraPermissionDiffIsRecordedEvenWhenTheProfileAlreadyGrantsIt() {
        br.com.navitasassist.user.UserAccountTestSupport.ensureAdmin(users, profiles, passwords);
        var profile = profilesService.create(new br.com.navitasassist.access.ProfileRequest("Audit redundant", java.util.Set.of("rma.ver")), "admin");
        var user = usersService.create(new br.com.navitasassist.user.UserAccountRequest("audit.redundant", "Target", "secret123", profile.id(), java.util.Set.of(), true), "admin");
        usersService.update(user.id(), new br.com.navitasassist.user.UserAccountUpdateRequest("audit.redundant", "Target", null, profile.id(), java.util.Set.of("rma.ver"), true), "admin");
        usersService.update(user.id(), new br.com.navitasassist.user.UserAccountUpdateRequest("audit.redundant", "Target", null, profile.id(), java.util.Set.of(), true), "admin");
        var summaries = jdbc.queryForList("select summary from audit_events where entity_type = 'USER' and entity_id = ? order by id", String.class, user.id());
        assertThat(summaries).contains("Permissão extra adicionada: rma.ver.", "Permissão extra removida: rma.ver.");
    }

    @Test @WithMockUser(username="session.actor")
    void changingUserProfileRecordsAddedAndRemovedEffectivePermissions() {
        br.com.navitasassist.user.UserAccountTestSupport.ensureAdmin(users, profiles, passwords);
        var previousProfile = profilesService.create(new br.com.navitasassist.access.ProfileRequest("Audit previous profile", java.util.Set.of("rma.ver")), "admin");
        var nextProfile = profilesService.create(new br.com.navitasassist.access.ProfileRequest("Audit next profile", java.util.Set.of("cadastros.ver")), "admin");
        var user = usersService.create(new br.com.navitasassist.user.UserAccountRequest("audit.profile.change", "Target", "secret123", previousProfile.id(), java.util.Set.of("rma.ver"), true), "admin");
        var updated = usersService.update(user.id(), new br.com.navitasassist.user.UserAccountUpdateRequest("audit.profile.change", "Target", null, nextProfile.id(), java.util.Set.of(), true), "admin");
        assertThat(updated.profile().id()).isEqualTo(nextProfile.id());
        assertThat(jdbc.queryForObject("select profile_id from user_accounts where id = ?", Long.class, user.id())).isEqualTo(nextProfile.id());
        var events = jdbc.queryForList("select actor_username, action, summary from audit_events where entity_type = 'USER' and entity_id = ? order by id", user.id());
        assertThat(events).hasSize(5);
        assertThat(events).allSatisfy(event -> assertThat(event.get("actor_username")).isEqualTo("session.actor"));
        assertThat(events.toString()).contains("Permissão adicionada: cadastros.ver.", "Permissão removida: rma.ver.", "Permissão extra removida: rma.ver.", "Campos alterados: profile, extraPermissions.");
    }

    @Test @WithMockUser(username="old.username")
    void actorIdComesFromLoginSessionEvenAfterTheUsernameChanges() {
        var authentication = (org.springframework.security.authentication.AbstractAuthenticationToken)
            org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        authentication.setDetails(new br.com.navitasassist.auth.LoginSessionDetails(777L, "192.0.2.99"));
        audit.record("UPDATE", "USER", 1L, "renamed.username", "Campos alterados: username.");
        var event = jdbc.queryForMap("select actor_id, actor_username from audit_events where entity_label = 'renamed.username'");
        assertThat(event.get("actor_id")).isEqualTo(777L);
        assertThat(event.get("actor_username")).isEqualTo("old.username");
    }

    @Test @WithMockUser(username="admin")
    void productLifecycleContainsOnlyNamesOfChangedFields() {
        var product = products.create(new br.com.navitasassist.product.ProductRequest("AUD-TEST", "Audit product", "A", null, null, 12, "private technical"));
        products.update(product.id(), new br.com.navitasassist.product.ProductRequest("AUD-TEST", "Audit product", "B", null, null, 24, "secret technical"));
        products.delete(product.id());
        var events = jdbc.queryForList("select summary, entity_label from audit_events where entity_type = 'PRODUCT' and entity_id = ? order by id", product.id());
        assertThat(events).hasSize(3);
        assertThat(events.get(1).get("summary").toString()).contains("category", "defaultWarrantyMonths", "technicalNotes").doesNotContain("secret technical");
        assertThat(events.get(2).get("entity_label").toString()).contains("AUD-TEST", "Audit product");
    }


    @Test @WithMockUser(username="admin")
    void clientLifecycleRecordsActorAndOnlyChangedFieldNames() {
        var created = clients.create(new ClientRequest("Audit client", null, "123", "private@example.com", "12345", "private street", "secret note"));
        clients.update(created.id(), new ClientRequest("Audit client", null, "456", "other@example.com", "99999", "another street", "another note"));
        clients.delete(created.id());
        var events = jdbc.queryForList("select * from audit_events where entity_type = 'CLIENT' and entity_id = ? order by id", created.id());
        assertThat(events).hasSize(3);
        assertThat(events.get(0).get("actor_username")).isEqualTo("admin");
        assertThat(events.get(1).get("summary").toString()).contains("documentNumber", "email", "phone", "address", "notes").doesNotContain("@", "456", "99999", "street", "another note");
        assertThat(events.get(2).get("entity_label")).isEqualTo("Audit client");
    }

    @Test
    void dateFiltersRespectSaoPauloMidnightAndStableIdOrdering() throws Exception {
        jdbc.update("insert into audit_events(occurred_at, actor_username, action, entity_type, entity_label, summary) values (?, 'date.actor', 'CREATE', 'DATE_TEST', 'before', 'Criado.')", java.sql.Timestamp.valueOf("2026-11-13 02:59:59"));
        jdbc.update("insert into audit_events(occurred_at, actor_username, action, entity_type, entity_label, summary) values (?, 'date.actor', 'CREATE', 'DATE_TEST', 'first', 'Criado.')", java.sql.Timestamp.valueOf("2026-11-13 03:00:00"));
        jdbc.update("insert into audit_events(occurred_at, actor_username, action, entity_type, entity_label, summary) values (?, 'date.actor', 'CREATE', 'DATE_TEST', 'second', 'Criado.')", java.sql.Timestamp.valueOf("2026-11-13 03:00:00"));
        jdbc.update("insert into audit_events(occurred_at, actor_username, action, entity_type, entity_label, summary) values (?, 'date.actor', 'CREATE', 'DATE_TEST', 'after', 'Criado.')", java.sql.Timestamp.valueOf("2026-11-14 03:00:00"));
        mvc.perform(get("/api/audit-events").param("from", "2026-11-13").param("to", "2026-11-13").param("entityType", "DATE_TEST").param("size", "1")
            .with(user("reader").authorities(new SimpleGrantedAuthority("auditoria.ver"))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(2)).andExpect(jsonPath("$.totalPages").value(2)).andExpect(jsonPath("$.content[0].entityLabel").value("second"));
        mvc.perform(get("/api/audit-events").param("from", "2026-11-13").param("to", "2026-11-13").param("entityType", "DATE_TEST").param("size", "1").param("page", "1")
            .with(user("reader").authorities(new SimpleGrantedAuthority("auditoria.ver"))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.content[0].entityLabel").value("first"));
    }

    @Test
    void queryRequiresOwnPermissionAndRejectsAnonymous() throws Exception {
        mvc.perform(get("/api/audit-events")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/audit-events").with(user("desk").authorities(new SimpleGrantedAuthority("usuarios.gerir")))).andExpect(status().isForbidden());
        mvc.perform(get("/api/audit-events").with(user("admin").authorities(new SimpleGrantedAuthority("auditoria.ver")))).andExpect(status().isOk()).andExpect(jsonPath("$.size").value(20));
    }

    @Test @WithMockUser(username="audit.pagination")
    void paginationAndFiltersUseStableDescendingOrderAndBusinessDates() throws Exception {
        audit.record("CREATE", "CLIENT", 1L, "A", "Criado.");
        audit.record("UPDATE", "PRODUCT", 2L, "B", "Alterado.");
        mvc.perform(get("/api/audit-events").param("actor", "AUDIT.PAGINATION").param("action", "UPDATE").param("entityType", "PRODUCT").param("size", "1")
            .with(user("admin").authorities(new SimpleGrantedAuthority("auditoria.ver"))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1)).andExpect(jsonPath("$.content[0].entityLabel").value("B"));
        mvc.perform(get("/api/audit-events").param("size", "101").with(user("admin").authorities(new SimpleGrantedAuthority("auditoria.ver")))).andExpect(status().isBadRequest());
    }
}
