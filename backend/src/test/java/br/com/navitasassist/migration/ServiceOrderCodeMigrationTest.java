package br.com.navitasassist.migration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import br.com.navitasassist.support.PostgresTestDatabase;
import java.sql.SQLException;
import org.junit.jupiter.api.Test;

/** A baseline nasce sem códigos legados RMA-; o código OS- é único sem diferenciar caixa. */
class ServiceOrderCodeMigrationTest {
    @Test
    void serviceOrderCodeIsUniqueIgnoringCase() throws Exception {
        PostgresTestDatabase.Coordinates database = PostgresTestDatabase.migrated("service_order_code");
        try (var connection = database.connect(); var sql = connection.createStatement()) {
            try (var rows = sql.executeQuery("SELECT count(*) FROM rmas WHERE code LIKE 'RMA-%'")) {
                rows.next();
                assertEquals(0, rows.getInt(1));
            }
            sql.executeUpdate("INSERT INTO clients (id, legal_name, created_at, updated_at) VALUES (900, 'Cliente', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
            sql.executeUpdate("INSERT INTO products (id, sku, name, default_warranty_months, created_at, updated_at) VALUES (900, 'OS', 'Produto', 12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
            String insert = "INSERT INTO rmas (id, code, client_id, product_id, purchase_date_unknown, entry_date, received_by, reported_failure, priority, status, created_at, updated_at) VALUES (%d, '%s', 900, 900, TRUE, CURRENT_DATE, 'desk', 'Falha', 'MEDIUM', 'RECEIVED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)";
            sql.executeUpdate(insert.formatted(900, "OS-2026-000042"));
            SQLException duplicate = assertThrows(SQLException.class, () -> sql.executeUpdate(insert.formatted(901, "os-2026-000042")));
            assertEquals("23505", duplicate.getSQLState());
        }
    }
}
