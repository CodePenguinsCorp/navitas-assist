package br.com.navitasassist.migration;

import static org.junit.jupiter.api.Assertions.*;
import java.sql.*;
import br.com.navitasassist.support.PostgresTestDatabase;
import org.junit.jupiter.api.Test;

/** Entrega de e-mail no schema final: padrões das colunas novas, status permitidos e e-mail único sem caixa. */
class NotificationEmailMigrationTest {
    @Test
    void defaultsEmailColumnsAndEnforcesCaseInsensitiveEmail() throws Exception {
        PostgresTestDatabase.Coordinates database = PostgresTestDatabase.migrated("email_migration");
        PostgresTestDatabase.flyway(database).validate();
        try (Connection c = database.connect(); Statement s = c.createStatement()) {
            s.executeUpdate("insert into user_accounts(username, full_name, password_hash, profile_id, active, created_at, updated_at) select 'legacy','Legacy','hash',id,true,current_timestamp,current_timestamp from access_profiles where legacy_code='ADMIN'");
            s.executeUpdate("insert into notification_events(event_key,event_type,status,recipient_count,occurred_at) values ('legacy','RMA_CREATED','PROCESSED',1,current_timestamp)");
            s.executeUpdate("insert into notifications(event_id,recipient_id,event_type,severity,title,message,created_at,email_status) select e.id,u.id,'RMA_CREATED','INFO','Legacy','Legacy',current_timestamp,'FAILED' from notification_events e cross join user_accounts u where e.event_key='legacy' and u.username='legacy'");
            try (ResultSet row = s.executeQuery("select u.email,n.app_visible,n.email_status,n.email_attempts,n.email_next_attempt_at,n.email_generation from notifications n join user_accounts u on u.id=n.recipient_id where u.username='legacy'")) {
                assertTrue(row.next()); assertNull(row.getString(1)); assertTrue(row.getBoolean(2));
                assertEquals("FAILED", row.getString(3)); assertEquals(0, row.getInt(4)); assertNull(row.getTimestamp(5)); assertEquals(0, row.getInt(6));
            }
            s.executeUpdate("update notifications set email_status='PENDING' where title='Legacy'");
            assertThrows(SQLException.class, () -> s.executeUpdate("update notifications set email_status='UNKNOWN' where title='Legacy'"));
            try (ResultSet rows = s.executeQuery("select count(*) from notification_rules where app_enabled")) { rows.next(); assertEquals(5, rows.getInt(1)); }

            s.executeUpdate("insert into access_profiles(name, created_at, updated_at) values ('Email migration', current_timestamp, current_timestamp)");
            String insert = "insert into user_accounts(username, full_name, password_hash, profile_id, active, created_at, updated_at, email) values ('%s','Test','hash',(select id from access_profiles where name='Email migration'),true,current_timestamp,current_timestamp,%s)";
            s.executeUpdate(insert.formatted("null1", "null"));
            s.executeUpdate(insert.formatted("null2", "null"));
            s.executeUpdate(insert.formatted("email1", "'Test@example.invalid'"));
            SQLException duplicate = assertThrows(SQLException.class, () -> s.executeUpdate(insert.formatted("email2", "'test@example.invalid'")));
            assertEquals("23505", duplicate.getSQLState());
            assertTrue(duplicate.getMessage().contains("uk_user_accounts_email"), duplicate.getMessage());
            // Só a caixa é ignorada: o acento continua distinguindo endereços.
            s.executeUpdate(insert.formatted("email3", "'tést@example.invalid'"));
        }
    }
}
