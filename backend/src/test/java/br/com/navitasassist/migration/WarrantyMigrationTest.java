package br.com.navitasassist.migration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.sql.SQLException;
import java.util.HashSet;
import java.util.Set;

import br.com.navitasassist.support.PostgresTestDatabase;
import org.junit.jupiter.api.Test;

/** Ajuste manual de garantia por item no schema final: sem ajuste por padrão e só valores válidos. */
class WarrantyMigrationTest {
    @Test
    void keepsItemsWithoutOverrideAndRestrictsOverrideValues() throws Exception {
        PostgresTestDatabase.Coordinates database = PostgresTestDatabase.migrated("warranty");
        try (var connection = database.connect(); var sql = connection.createStatement()) {
            sql.executeUpdate("INSERT INTO clients (id, legal_name, created_at, updated_at) VALUES (900, 'Cliente', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
            sql.executeUpdate("INSERT INTO products (id, sku, name, default_warranty_months, created_at, updated_at) VALUES (900, 'GARANTIA', 'Produto', 12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
            sql.executeUpdate("""
                INSERT INTO rmas (id, code, client_id, product_id, purchase_date_unknown, entry_date, received_by, reported_failure, priority, status, created_at, updated_at)
                VALUES (900, 'GARANTIA', 900, 900, TRUE, CURRENT_DATE, 'desk', 'Falha', 'MEDIUM', 'RECEIVED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """);
            sql.executeUpdate("INSERT INTO rma_items (id, rma_id, product_id, warranty_months) VALUES (900, 900, 900, 12)");
            try (var rows = sql.executeQuery("SELECT warranty_override, warranty_override_reason, warranty_override_by, warranty_override_at, warranty_months, item_position FROM rma_items WHERE id = 900")) {
                assertTrue(rows.next());
                for (int column = 1; column <= 4; column++) assertEquals(null, rows.getObject(column));
                assertEquals(12, rows.getInt(5));
                assertEquals(0, rows.getInt(6));
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
