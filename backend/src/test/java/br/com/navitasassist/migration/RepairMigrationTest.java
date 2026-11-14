package br.com.navitasassist.migration;

import static org.junit.jupiter.api.Assertions.*;
import java.sql.SQLException;
import br.com.navitasassist.support.PostgresTestDatabase;
import org.junit.jupiter.api.Test;

/** Reparo no schema final: aplicação de peça do estoque, componentes externos, intervenções e anulação. */
class RepairMigrationTest {
    @Test
    void restrictsRepairRecords() throws Exception {
        PostgresTestDatabase.Coordinates database = PostgresTestDatabase.migrated("repair");
        try (var connection = database.connect(); var sql = connection.createStatement()) {
            sql.executeUpdate("INSERT INTO clients (id, legal_name, created_at, updated_at) VALUES (900, 'Cliente', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
            sql.executeUpdate("INSERT INTO products (id, sku, name, default_warranty_months, created_at, updated_at) VALUES (900, 'REPAIR', 'Produto', 12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
            sql.executeUpdate("INSERT INTO rmas (id, code, client_id, product_id, purchase_date_unknown, entry_date, received_by, reported_failure, priority, status, created_at, updated_at) VALUES (900, 'REPAIR', 900, 900, TRUE, CURRENT_DATE, 'desk', 'Falha', 'MEDIUM', 'COMPLETED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
            sql.executeUpdate("INSERT INTO parts (id, code, name, unit, minimum_stock, unit_cost, on_hand_quantity, reserved_quantity, active, created_at, updated_at) VALUES (900, 'PART', 'Peça', 'un', 0, 1, 0, 0, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
            sql.executeUpdate("INSERT INTO part_reservations (id, part_id, rma_id, quantity, status, created_at, updated_at) VALUES (900, 900, 900, 2.125, 'CONSUMED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
            try (var rows = sql.executeQuery("SELECT replacement_reason, component_batch, applied_at, applied_by, quantity, status FROM part_reservations WHERE id = 900")) {
                assertTrue(rows.next());
                for (int column = 1; column <= 4; column++) assertNull(rows.getObject(column));
                assertEquals("2.125", rows.getBigDecimal(5).toPlainString()); assertEquals("CONSUMED", rows.getString(6));
            }
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
            assertThrows(SQLException.class, () -> sql.executeUpdate(intervention.formatted("INVALID", "1")));
            assertThrows(SQLException.class, () -> sql.executeUpdate(intervention.formatted("CLEANING", "1").replace("(900,", "(999,")));
            sql.executeUpdate("INSERT INTO rma_repair_history (rma_id, entity_type, entity_id, action, changed_by, changed_at, summary) VALUES (900, 'INTERVENTION', 1, 'CREATE', 'tech', CURRENT_TIMESTAMP, 'Intervenção registrada')");
            assertThrows(SQLException.class, () -> sql.executeUpdate("INSERT INTO rma_repair_history (rma_id, entity_type, entity_id, action, changed_by, changed_at, summary) VALUES (999, 'INTERVENTION', 1, 'CREATE', 'tech', CURRENT_TIMESTAMP, 'Órfão')"));
        }
    }
}
