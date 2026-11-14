package br.com.navitasassist.migration;

import static org.assertj.core.api.Assertions.assertThat;
import java.sql.DriverManager;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

class AuditMigrationTest {
    @Test void addsAppendOnlyTrailAndGrantsOnlyAdministratorWithoutChangingExistingRows() throws Exception {
        String url = "jdbc:h2:mem:audit_migration_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1";
        Flyway.configure().dataSource(url, "sa", "").target("12").load().migrate();
        try (var connection = DriverManager.getConnection(url, "sa", ""); var statement = connection.createStatement()) {
            statement.execute("insert into clients(legal_name, created_at, updated_at) values ('Preservado', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
            assertThat(Flyway.configure().dataSource(url, "sa", "").target("13").load().migrate().migrationsExecuted).isEqualTo(1);
            try (var rows = statement.executeQuery("select count(*) from clients where legal_name = 'Preservado'")) { rows.next(); assertThat(rows.getInt(1)).isEqualTo(1); }
            try (var rows = statement.executeQuery("select legacy_code from access_profiles p join access_profile_permissions pp on pp.profile_id=p.id where pp.permission='auditoria.ver'")) {
                assertThat(rows.next()).isTrue(); assertThat(rows.getString(1)).isEqualTo("ADMIN"); assertThat(rows.next()).isFalse();
            }
            statement.execute("insert into audit_events(occurred_at, actor_username, action, entity_type, summary) values (CURRENT_TIMESTAMP, 'admin', 'CREATE', 'CLIENT', 'Criado.')");
            try (var rows = statement.executeQuery("select count(*) from audit_events")) { rows.next(); assertThat(rows.getInt(1)).isEqualTo(1); }
        }
    }
}
