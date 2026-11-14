package br.com.navitasassist.migration;

import static org.junit.jupiter.api.Assertions.*;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

class ServiceOrderCodeMigrationTest {
    @Test
    void convertsLegacyCodesPreservingSequenceAndUniqueness() throws Exception {
        String url = "jdbc:h2:mem:service_order_" + UUID.randomUUID() + ";MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1";
        Flyway.configure().dataSource(url, "sa", "").target("13").load().migrate();
        try (var connection = DriverManager.getConnection(url, "sa", ""); var sql = connection.createStatement()) {
            sql.executeUpdate("INSERT INTO clients (id, legal_name, created_at, updated_at) VALUES (900, 'Cliente', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
            sql.executeUpdate("INSERT INTO products (id, sku, name, default_warranty_months, created_at, updated_at) VALUES (900, 'OS', 'Produto', 12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
            String insert = "INSERT INTO rmas (id, code, client_id, product_id, purchase_date_unknown, entry_date, received_by, reported_failure, priority, status, created_at, updated_at) VALUES (%d, '%s', 900, 900, TRUE, CURRENT_DATE, 'desk', 'Falha', 'MEDIUM', 'RECEIVED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)";
            sql.executeUpdate(insert.formatted(900, "RMA-2026-000042"));
            sql.executeUpdate(insert.formatted(901, "RMA-2025-999999"));
            sql.executeUpdate(insert.formatted(902, "OS-2026-000043"));
            sql.executeUpdate(insert.formatted(903, "LEGACY"));
            assertEquals(1, Flyway.configure().dataSource(url, "sa", "").target("14").load().migrate().migrationsExecuted);
            try (var rows = sql.executeQuery("SELECT code FROM rmas ORDER BY id")) {
                for (String code : new String[]{"OS-2026-000042", "OS-2025-999999", "OS-2026-000043", "LEGACY"}) {
                    assertTrue(rows.next());
                    assertEquals(code, rows.getString(1));
                }
                assertFalse(rows.next());
            }
            assertThrows(SQLException.class, () -> sql.executeUpdate(insert.formatted(904, "OS-2026-000042")));
        }
        assertEquals(0, Flyway.configure().dataSource(url, "sa", "").load().migrate().migrationsExecuted);
    }
}
