package br.com.navitasassist.migration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import br.com.navitasassist.support.PostgresTestDatabase;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.junit.jupiter.api.Test;

class PerformanceIndexMigrationTest {
    @Test
    void baselineHasOrderedCompositeIndexesAndNoRedundantOwnerIndex() throws Exception {
        PostgresTestDatabase.Coordinates database = PostgresTestDatabase.migrated("performance_indexes");
        try (var connection = database.connect()) {
            assertEquals(List.of("entry_date", "id"), indexes(connection, "rmas").get("idx_rmas_entry_date_id"));
            assertEquals(List.of("status", "entry_date"), indexes(connection, "rmas").get("idx_rmas_status_entry_date"));
            assertEquals(List.of("recipient_id", "created_at"), indexes(connection, "notifications").get("idx_notifications_recipient_created"));
            assertFalse(indexes(connection, "kanban_views").containsKey("idx_kanban_views_owner_id"));
        }
    }

    private Map<String, List<String>> indexes(Connection connection, String table) throws SQLException {
        Map<String, List<String>> indexes = new HashMap<>();
        try (var rows = connection.getMetaData().getIndexInfo(null, "public", table, false, false)) {
            while (rows.next()) {
                String name = rows.getString("INDEX_NAME");
                if (name != null) {
                    indexes.computeIfAbsent(name.toLowerCase(Locale.ROOT), ignored -> new ArrayList<>()).add(rows.getString("COLUMN_NAME"));
                }
            }
        }
        return indexes;
    }
}
