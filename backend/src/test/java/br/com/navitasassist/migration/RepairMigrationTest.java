package br.com.navitasassist.migration;

import static org.junit.jupiter.api.Assertions.*;
import java.sql.SQLException;
import br.com.navitasassist.support.PostgresTestDatabase;
import org.junit.jupiter.api.Test;

/** Reparo no schema final: aplicação de peça do estoque, componentes externos, reparos e anulação. */
class RepairMigrationTest {
    @Test
    void restrictsRepairRecords() throws Exception {
        PostgresTestDatabase.Coordinates database = PostgresTestDatabase.migrated("repair");
        try (var connection = database.connect(); var sql = connection.createStatement()) {
            sql.executeUpdate("INSERT INTO clients (id, legal_name, created_at, updated_at) VALUES (900, 'Cliente', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
            sql.executeUpdate("INSERT INTO products (id, sku, name, default_warranty_months, created_at, updated_at) VALUES (900, 'REPAIR', 'Produto', 12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
            sql.executeUpdate("INSERT INTO rmas (id, code, client_id, purchase_date_unknown, entry_date, received_by, reported_failure, priority, status, created_at, updated_at) VALUES (900, 'REPAIR', 900, TRUE, CURRENT_DATE, 'desk', 'Falha', 'MEDIUM', 'COMPLETED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
            sql.executeUpdate("INSERT INTO parts (id, code, name, unit, minimum_stock, unit_cost, on_hand_quantity, active, created_at, updated_at) VALUES (900, 'PART', 'Peça', 'un', 0, 1, 0, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
            sql.executeUpdate("INSERT INTO part_usages (id, part_id, rma_id, quantity, status, replacement_reason, applied_at, applied_by, created_at, updated_at) VALUES (900, 900, 900, 2.125, 'USED', 'Falha', CURRENT_TIMESTAMP, 'tech', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
            try (var rows = sql.executeQuery("SELECT replacement_reason, component_batch, applied_at, applied_by, quantity, status FROM part_usages WHERE id = 900")) {
                assertTrue(rows.next());
                assertEquals("Falha", rows.getString(1));
                assertNull(rows.getObject(2));
                assertNotNull(rows.getObject(3));
                assertEquals("tech", rows.getString(4));
                assertEquals("2.125", rows.getBigDecimal(5).toPlainString()); assertEquals("USED", rows.getString(6));
            }
            String usage = "INSERT INTO part_usages (part_id, rma_id, quantity, status, replacement_reason, applied_at, applied_by, created_at, updated_at) VALUES (900, 900, %s, '%s', %s, CURRENT_TIMESTAMP, 'tech', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)";
            assertThrows(SQLException.class, () -> sql.executeUpdate(usage.formatted("0", "USED", "'Falha'")));
            assertThrows(SQLException.class, () -> sql.executeUpdate(usage.formatted("1", "INVALID", "'Falha'")));
            assertThrows(SQLException.class, () -> sql.executeUpdate(usage.formatted("1", "USED", "NULL")));
            sql.executeUpdate(usage.formatted("1", "REVERTED", "'Correção'"));
            String movement = "INSERT INTO part_movements (part_id, type, quantity, on_hand_change, on_hand_after, unit_cost, total_cost, rma_id, usage_id, created_by, created_at) VALUES (900, '%s', 1, -1, 0, 1, 1, 900, 900, 'tech', CURRENT_TIMESTAMP)";
            sql.executeUpdate(movement.formatted("CONSUMPTION"));
            assertThrows(SQLException.class, () -> sql.executeUpdate(movement.formatted("INVALID")));
            String external = "INSERT INTO rma_external_components (rma_id, description, quantity, replacement_reason, applied_at, applied_by, created_at, updated_at) VALUES (900, 'Conector', %s, 'Falha', CURRENT_TIMESTAMP, 'tech', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)";
            sql.executeUpdate(external.formatted("1.125"));
            assertThrows(SQLException.class, () -> sql.executeUpdate(external.formatted("0")));
            assertThrows(SQLException.class, () -> sql.executeUpdate(external.formatted("-1")));
            try (var rows = sql.executeQuery("SELECT unit, voided_at, void_reason, edited_at FROM rma_external_components")) {
                assertTrue(rows.next()); assertEquals("un", rows.getString(1)); assertNull(rows.getObject(2)); assertNull(rows.getString(3)); assertNull(rows.getObject(4));
            }
            String intervention = "INSERT INTO rma_interventions (rma_id, type, description, performed_on, hours, technician_name, created_at, updated_at) VALUES (900, '%s', 'Reparo', CURRENT_DATE, %s, 'tech', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)";
            sql.executeUpdate(intervention.formatted("CLEANING", "0.125"));
            assertThrows(SQLException.class, () -> sql.executeUpdate(intervention.formatted("CLEANING", "0")));
            sql.executeUpdate(intervention.formatted("Texto livre", "1"));
            sql.executeUpdate(intervention.formatted("CLEANING", "NULL"));
            assertThrows(SQLException.class, () -> sql.executeUpdate(intervention.formatted("T".repeat(81), "1")));
            assertThrows(SQLException.class, () -> sql.executeUpdate(intervention.formatted("CLEANING", "1").replace("(900,", "(999,")));
            sql.executeUpdate("INSERT INTO rma_repair_history (rma_id, entity_type, entity_id, action, changed_by, changed_at, summary) VALUES (900, 'INTERVENTION', 1, 'CREATE', 'tech', CURRENT_TIMESTAMP, 'Reparo registrado')");
            assertThrows(SQLException.class, () -> sql.executeUpdate("INSERT INTO rma_repair_history (rma_id, entity_type, entity_id, action, changed_by, changed_at, summary) VALUES (999, 'INTERVENTION', 1, 'CREATE', 'tech', CURRENT_TIMESTAMP, 'Órfão')"));
        }
    }
}
