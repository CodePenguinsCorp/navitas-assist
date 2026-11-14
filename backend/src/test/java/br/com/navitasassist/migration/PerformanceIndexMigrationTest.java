package br.com.navitasassist.migration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import java.sql.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class PerformanceIndexMigrationTest {
    @Test
    void addsOrderedCompositeIndexesAndRemovesRedundantOwnerIndex() throws Exception {
        String url = "jdbc:h2:mem:performance_" + UUID.randomUUID() + ";MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1";
        Flyway.configure().dataSource(url, "sa", "").target("14").load().migrate();
        try (var connection = DriverManager.getConnection(url, "sa", "")) {
            assertEquals(List.of("owner_id"), indexes(connection, "kanban_views").get("idx_kanban_views_owner_id"));
            long users = count(connection, "user_accounts");
            Flyway.configure().dataSource(url, "sa", "").load().migrate();
            assertEquals(List.of("entry_date", "id"), indexes(connection, "rmas").get("idx_rmas_entry_date_id"));
            assertEquals(List.of("status", "entry_date"), indexes(connection, "rmas").get("idx_rmas_status_entry_date"));
            assertEquals(List.of("recipient_id", "created_at"), indexes(connection, "notifications").get("idx_notifications_recipient_created"));
            assertFalse(indexes(connection, "kanban_views").containsKey("idx_kanban_views_owner_id"));
            assertEquals(users, count(connection, "user_accounts"));
        }
    }

    private long count(Connection connection, String table) throws SQLException {
        try (var statement = connection.createStatement(); var row = statement.executeQuery("select count(*) from " + table)) {
            row.next();
            return row.getLong(1);
        }
    }

    private Map<String, List<String>> indexes(Connection connection, String table) throws SQLException {
        Map<String, List<String>> indexes = new HashMap<>();
        try (var rows = connection.getMetaData().getIndexInfo(null, null, table, false, false)) {
            while (rows.next()) {
                String name = rows.getString("INDEX_NAME");
                if (name != null) indexes.computeIfAbsent(name.toLowerCase(Locale.ROOT), ignored -> new ArrayList<>()).add(rows.getString("COLUMN_NAME"));
            }
        }
        return indexes;
    }
}
