package br.com.navitasassist.migration;

import static org.junit.jupiter.api.Assertions.*;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;

import br.com.navitasassist.support.PostgresTestDatabase;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

class NotificationReadBatchMigrationTest {

    @Test
    void upgradesV1PreservingNotificationsReadStatesAndEmailDelivery() throws Exception {
        PostgresTestDatabase.Coordinates database = PostgresTestDatabase.create("notification_read_batch_migration");
        Flyway.configure().dataSource(database.url(), database.user(), database.password()).target("1").load().migrate();
        try (Connection connection = database.connect(); Statement statement = connection.createStatement()) {
            statement.executeUpdate("insert into user_accounts(username, full_name, password_hash, profile_id, active, created_at, updated_at) select 'legacy-batch','Legacy','hash',id,true,current_timestamp,current_timestamp from access_profiles where legacy_code='ADMIN'");
            statement.executeUpdate("insert into notification_events(event_key,event_type,status,recipient_count,occurred_at) values ('legacy-batch','RMA_CREATED','PROCESSED',1,current_timestamp), ('legacy-email','RMA_ASSIGNED','PROCESSED',1,current_timestamp)");
            statement.executeUpdate("""
                insert into notifications(event_id,recipient_id,event_type,severity,title,message,created_at,read_at,snoozed_until,email_status,app_visible,email_attempts,email_generation,email_next_attempt_at)
                select e.id,u.id,e.event_type,'INFO',e.event_key,'Original message',current_timestamp,
                    case when e.event_key='legacy-batch' then timestamp '2026-11-12 12:00:00' else null end,
                    timestamp '2026-11-14 12:00:00', 'PENDING', e.event_key='legacy-batch',2,3,timestamp '2026-11-14 12:00:00'
                from notification_events e cross join user_accounts u where u.username='legacy-batch'
                """);
        }

        assertEquals(1, PostgresTestDatabase.flyway(database).migrate().migrationsExecuted);
        PostgresTestDatabase.flyway(database).validate();
        try (Connection connection = database.connect(); Statement statement = connection.createStatement()) {
            try (ResultSet rows = statement.executeQuery("select * from notifications order by title")) {
                assertTrue(rows.next());
                assertEquals("legacy-batch", rows.getString("title"));
                assertNotNull(rows.getTimestamp("read_at"));
                assertTrue(rows.getBoolean("app_visible"));
                assertNull(rows.getString("read_batch_token"));
                assertNull(rows.getTimestamp("read_batch_expires_at"));
                assertNull(rows.getString("rma_priority"));
                assertEquals("Original message", rows.getString("message"));
                assertNotNull(rows.getTimestamp("snoozed_until"));
                assertTrue(rows.next());
                assertEquals("legacy-email", rows.getString("title"));
                assertNull(rows.getTimestamp("read_at"));
                assertFalse(rows.getBoolean("app_visible"));
                assertEquals("PENDING", rows.getString("email_status"));
                assertEquals(2, rows.getInt("email_attempts"));
                assertEquals(3, rows.getInt("email_generation"));
                assertNotNull(rows.getTimestamp("email_next_attempt_at"));
                assertFalse(rows.next());
            }
            assertEquals(1, statement.executeUpdate("update notifications set read_batch_token='bc8ef610-a16c-40e1-91b8-2fcaf0129cf6',read_batch_expires_at=current_timestamp,rma_priority='HIGH' where title='legacy-batch'"));
        }
    }
}
