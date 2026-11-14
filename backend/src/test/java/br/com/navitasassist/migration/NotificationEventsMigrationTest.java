package br.com.navitasassist.migration;

import static org.junit.jupiter.api.Assertions.*;
import java.sql.*;
import java.util.List;
import br.com.navitasassist.support.PostgresTestDatabase;
import org.junit.jupiter.api.Test;

/** Regras de notificação semeadas no estado final: só os tipos com produtor, ativos e com e-mail desligado. */
class NotificationEventsMigrationTest {
    @Test
    void seedsOnlyRealEventsActiveWithEmailOff() throws Exception {
        PostgresTestDatabase.Coordinates database = PostgresTestDatabase.migrated("events");
        try (Connection c = database.connect(); Statement s = c.createStatement()) {
            try (ResultSet rows = s.executeQuery("select event_type from notification_rules")) {
                while (rows.next()) assertTrue(List.of("RMA_CREATED", "RMA_ASSIGNED", "RMA_BLOCKED", "PART_PENDING", "TEST_FAILED").contains(rows.getString(1)));
            }
            for (String type : List.of("RMA_BLOCKED", "PART_PENDING", "TEST_FAILED")) {
                try (ResultSet row = s.executeQuery("select enabled,app_enabled,email_enabled,severity,notify_assignee,user_mutable from notification_rules where event_type='" + type + "'")) {
                    assertTrue(row.next()); assertTrue(row.getBoolean(1)); assertTrue(row.getBoolean(2)); assertFalse(row.getBoolean(3));
                    assertEquals("WARNING", row.getString(4)); assertEquals(!type.equals("PART_PENDING"), row.getBoolean(5)); assertTrue(row.getBoolean(6));
                }
                try (ResultSet rows = s.executeQuery("select p.legacy_code from notification_rule_recipient_profiles rp join notification_rules r on r.id=rp.rule_id join access_profiles p on p.id=rp.profile_id where r.event_type='" + type + "'")) {
                    assertTrue(rows.next()); assertEquals("ADMIN", rows.getString(1)); assertFalse(rows.next());
                }
            }
            try (ResultSet rows = s.executeQuery("select count(*) from notification_rules")) { rows.next(); assertEquals(5, rows.getInt(1)); }
            try (ResultSet rows = s.executeQuery("select count(*) from notification_rules where email_enabled")) { rows.next(); assertEquals(0, rows.getInt(1)); }
            String insert = "insert into notification_events(event_key,event_type,status,recipient_count,occurred_at) values ('KEY','RMA_CREATED','RECEIVED',0,current_timestamp)";
            s.executeUpdate(insert);
            assertThrows(SQLException.class, () -> s.executeUpdate(insert));
        }
    }
}
