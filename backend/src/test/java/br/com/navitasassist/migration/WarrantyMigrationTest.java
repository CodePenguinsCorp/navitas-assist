package br.com.navitasassist.migration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

class WarrantyMigrationTest {
    @Test
    void upgradesV2WithoutChangingExistingItemsAndRestrictsOverrideValues() throws Exception {
        String url = "jdbc:h2:mem:warranty_" + UUID.randomUUID() + ";MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1";
        Flyway.configure().dataSource(url, "sa", "").target("2").load().migrate();
        try (var connection = DriverManager.getConnection(url, "sa", ""); var sql = connection.createStatement()) {
            sql.executeUpdate("INSERT INTO clients (id, legal_name, created_at, updated_at) VALUES (900, 'Cliente', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
            sql.executeUpdate("INSERT INTO products (id, sku, name, default_warranty_months, created_at, updated_at) VALUES (900, 'GARANTIA', 'Produto', 12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
            sql.executeUpdate("""
                INSERT INTO rmas (id, code, client_id, product_id, purchase_date_unknown, entry_date, received_by, reported_failure, priority, status, created_at, updated_at)
                VALUES (900, 'GARANTIA', 900, 900, TRUE, CURRENT_DATE, 'desk', 'Falha', 'MEDIUM', 'RECEIVED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """);
            sql.executeUpdate("INSERT INTO rma_items (id, rma_id, product_id, warranty_months) VALUES (900, 900, 900, 12)");
        }
        assertEquals(1, Flyway.configure().dataSource(url, "sa", "").load().migrate().migrationsExecuted);
        try (var connection = DriverManager.getConnection(url, "sa", ""); var sql = connection.createStatement()) {
            try (var rows = sql.executeQuery("SELECT warranty_override, warranty_override_reason, warranty_override_by, warranty_override_at, warranty_months FROM rma_items WHERE id = 900")) {
                assertTrue(rows.next());
                for (int column = 1; column <= 4; column++) assertEquals(null, rows.getObject(column));
                assertEquals(12, rows.getInt(5));
            }
            for (String value : new String[]{"IN_WARRANTY", "OUT_OF_WARRANTY"}) {
                sql.executeUpdate("UPDATE rma_items SET warranty_override = '" + value + "' WHERE id = 900");
            }
            assertThrows(SQLException.class, () -> sql.executeUpdate("UPDATE rma_items SET warranty_override = 'PENDING' WHERE id = 900"));
            sql.executeUpdate("INSERT INTO rma_item_warranty_history (rma_item_id, new_override, reason, changed_by, changed_at) VALUES (900, 'IN_WARRANTY', 'Cortesia', 'desk', CURRENT_TIMESTAMP)");
            assertThrows(SQLException.class, () -> sql.executeUpdate("INSERT INTO rma_item_warranty_history (rma_item_id, new_override, changed_by, changed_at) VALUES (900, 'PENDING', 'desk', CURRENT_TIMESTAMP)"));
            assertThrows(SQLException.class, () -> sql.executeUpdate("INSERT INTO rma_item_warranty_history (rma_item_id, new_override, changed_by, changed_at) VALUES (999, 'IN_WARRANTY', 'desk', CURRENT_TIMESTAMP)"));
            Set<String> indexes = new HashSet<>();
            try (var rows = connection.getMetaData().getIndexInfo(null, null, "rma_item_warranty_history", false, false)) {
                while (rows.next()) indexes.add(rows.getString("INDEX_NAME"));
            }
            assertTrue(indexes.contains("idx_rma_item_warranty_history_item"));
        }
    }
}
