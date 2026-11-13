package br.com.navitasassist.migration;

import static org.junit.jupiter.api.Assertions.*;
import java.sql.*;
import java.util.List;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

class NotificationEventsMigrationTest {
    @Test
    void activatesRealEventsAndPurgesRemovedTypesWithoutChangingOtherRules() throws Exception {
        String url = "jdbc:h2:mem:events_" + UUID.randomUUID() + ";MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1";
        Flyway.configure().dataSource(url, "sa", "").target("11").load().migrate();
        try (Connection c = DriverManager.getConnection(url, "sa", ""); Statement s = c.createStatement()) {
            s.executeUpdate("insert into user_accounts(username,full_name,password_hash,profile_id,active,created_at,updated_at) select 'migration','Migration','hash',id,true,current_timestamp,current_timestamp from access_profiles where legacy_code='ADMIN'");
            s.executeUpdate("update notification_rules set email_enabled=true where event_type in ('RMA_BLOCKED','PART_PENDING','TEST_FAILED')");
            s.executeUpdate("insert into notification_rule_recipient_profiles(rule_id,profile_id) select r.id,p.id from notification_rules r cross join access_profiles p where r.event_type <> 'RMA_CREATED' and p.legacy_code='SERVICE_DESK'");
            for (String type : List.of("WIP_LIMIT_EXCEEDED", "INTERNAL_APPROVAL_REQUIRED", "RECURRENCE_DETECTED", "RMA_CREATED")) {
                s.executeUpdate("insert into notification_events(event_key,event_type,status,recipient_count,occurred_at) values ('" + type + "','" + type + "','PROCESSED',1,current_timestamp)");
                s.executeUpdate("insert into notifications(event_id,recipient_id,event_type,severity,title,message,created_at,email_status) select e.id,u.id,'" + type + "','WARNING','Legado','Legado',current_timestamp,'NOT_REQUESTED' from notification_events e cross join user_accounts u where e.event_key='" + type + "' and u.username='migration'");
                s.executeUpdate("insert into notification_mutes(user_id,event_type,created_at) select id,'" + type + "',current_timestamp from user_accounts where username='migration'");
            }
        }
        assertEquals(1, Flyway.configure().dataSource(url, "sa", "").target("12").load().migrate().migrationsExecuted);
        Flyway.configure().dataSource(url, "sa", "").load().migrate();
        Flyway.configure().dataSource(url, "sa", "").load().validate();
        try (Connection c = DriverManager.getConnection(url, "sa", ""); Statement s = c.createStatement()) {
            for (String table : List.of("notification_rules", "notification_mutes", "notification_events", "notifications")) {
                try (ResultSet rows = s.executeQuery("select event_type from " + table)) {
                    while (rows.next()) assertTrue(List.of("RMA_CREATED", "RMA_ASSIGNED", "RMA_BLOCKED", "PART_PENDING", "TEST_FAILED").contains(rows.getString(1)));
                }
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
            for (String table : List.of("notification_mutes", "notification_events", "notifications")) {
                try (ResultSet rows = s.executeQuery("select count(*) from " + table + " where event_type='RMA_CREATED'")) { rows.next(); assertEquals(1, rows.getInt(1)); }
            }
            try (ResultSet rows = s.executeQuery("select count(*) from notification_rules")) { rows.next(); assertEquals(5, rows.getInt(1)); }
        }
    }
}
