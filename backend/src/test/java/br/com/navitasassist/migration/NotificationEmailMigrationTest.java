package br.com.navitasassist.migration;

import static org.junit.jupiter.api.Assertions.*;
import java.sql.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

class NotificationEmailMigrationTest {
    @Test
    void upgradesV3WithoutSchedulingLegacyAndEnforcesCaseInsensitiveEmail() throws Exception {
        String url = "jdbc:h2:mem:email_migration;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1";
        Flyway.configure().dataSource(url, "sa", "").target("3").load().migrate();
        try (Connection c = DriverManager.getConnection(url, "sa", ""); Statement statement = c.createStatement()) {
            statement.executeUpdate("insert into user_accounts(username, full_name, password_hash, profile_id, active, created_at, updated_at) select 'legacy','Legacy','hash',id,true,current_timestamp,current_timestamp from access_profiles where legacy_code='ADMIN'");
            statement.executeUpdate("insert into notification_events(event_key,event_type,status,recipient_count,occurred_at) values ('legacy','RMA_CREATED','PROCESSED',1,current_timestamp)");
            statement.executeUpdate("insert into notifications(event_id,recipient_id,event_type,severity,title,message,created_at,email_status) select e.id,u.id,'RMA_CREATED','INFO','Legacy','Legacy',current_timestamp,'FAILED' from notification_events e cross join user_accounts u where e.event_key='legacy' and u.username='legacy'");
        }
        Flyway.configure().dataSource(url, "sa", "").load().migrate();
        Flyway.configure().dataSource(url, "sa", "").load().validate();
        try (Connection c = DriverManager.getConnection(url, "sa", ""); Statement s = c.createStatement()) {
            try (ResultSet legacy = s.executeQuery("select u.email,n.app_visible,n.email_status,n.email_attempts,n.email_next_attempt_at from notifications n join user_accounts u on u.id=n.recipient_id where u.username='legacy'")) {
                assertTrue(legacy.next()); assertNull(legacy.getString(1)); assertTrue(legacy.getBoolean(2));
                assertEquals("FAILED", legacy.getString(3)); assertEquals(0, legacy.getInt(4)); assertNull(legacy.getTimestamp(5));
            }
            s.executeUpdate("update notifications set email_status='PENDING' where title='Legacy'");
            assertThrows(SQLException.class, () -> s.executeUpdate("update notifications set email_status='UNKNOWN' where title='Legacy'"));
            s.executeQuery("select app_visible, email_attempts, email_next_attempt_at from notifications");
            s.executeQuery("select app_enabled from notification_rules");
            try (ResultSet rows = s.executeQuery("select count(*) from notification_rules")) { rows.next(); assertEquals(8, rows.getInt(1)); }

            s.executeUpdate("insert into access_profiles(name, created_at, updated_at) values ('Email migration', current_timestamp, current_timestamp)");
            String insert = "insert into user_accounts(username, full_name, password_hash, profile_id, active, created_at, updated_at, email) values ('%s','Test','hash',(select id from access_profiles where name='Email migration'),true,current_timestamp,current_timestamp,%s)";
            s.executeUpdate(insert.formatted("null1", "null"));
            s.executeUpdate(insert.formatted("null2", "null"));
            s.executeUpdate(insert.formatted("email1", "'Test@example.invalid'"));
            assertThrows(SQLException.class, () -> s.executeUpdate(insert.formatted("email2", "'test@example.invalid'")));
        }
    }
}
