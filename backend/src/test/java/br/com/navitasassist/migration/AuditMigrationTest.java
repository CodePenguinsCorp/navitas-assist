package br.com.navitasassist.migration;

import static org.assertj.core.api.Assertions.assertThat;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import br.com.navitasassist.support.PostgresTestDatabase;
import org.junit.jupiter.api.Test;

class AuditMigrationTest {
    @Test void createsAuditTrailAndGrantsOnlyAdministrator() throws Exception {
        PostgresTestDatabase.Coordinates database = PostgresTestDatabase.migrated("audit_migration");
        try (var connection = database.connect(); var statement = connection.createStatement()) {
            try (var rows = statement.executeQuery("select legacy_code from access_profiles p join access_profile_permissions pp on pp.profile_id=p.id where pp.permission='auditoria.ver'")) {
                assertThat(rows.next()).isTrue(); assertThat(rows.getString(1)).isEqualTo("ADMIN"); assertThat(rows.next()).isFalse();
            }
            // timestamptz guarda o instante: gravado com outro fuso, volta igual em UTC.
            statement.execute("insert into audit_events(occurred_at, actor_username, action, entity_type, summary) values ('2026-11-14 10:00:00-03', 'admin', 'CREATE', 'CLIENT', 'Criado.')");
            try (var rows = statement.executeQuery("select count(*), max(occurred_at) from audit_events")) {
                rows.next();
                assertThat(rows.getInt(1)).isEqualTo(1);
                assertThat(rows.getObject(2, OffsetDateTime.class).toInstant()).isEqualTo(Instant.parse("2026-11-14T13:00:00Z"));
                assertThat(rows.getObject(2, OffsetDateTime.class).withOffsetSameInstant(ZoneOffset.UTC).getHour()).isEqualTo(13);
            }
        }
    }
}
