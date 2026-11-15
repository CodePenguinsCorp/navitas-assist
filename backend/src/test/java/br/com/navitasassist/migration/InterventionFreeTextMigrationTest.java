package br.com.navitasassist.migration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.sql.SQLException;

import br.com.navitasassist.support.PostgresTestDatabase;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

/** Tipo da intervenção vira texto livre (80), os códigos antigos passam para português e as horas ficam opcionais. */
class InterventionFreeTextMigrationTest {
    private static final String INTERVENTION = "INSERT INTO rma_interventions (id, rma_id, type, description, performed_on, hours, technician_name, created_at, updated_at) "
        + "VALUES (%d, 900, '%s', 'Reparo', CURRENT_DATE, %s, 'tech', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)";

    @Test
    void convertsOldCodesKeepsHoursAndAcceptsFreeTextWithoutHours() throws Exception {
        PostgresTestDatabase.Coordinates database = PostgresTestDatabase.create("intervention_free_text");
        Flyway.configure().dataSource(database.url(), database.user(), database.password())
            .locations("classpath:db/migration").target("3").load().migrate();
        String[][] types = {{"RESOLDERING", "Ressolda"}, {"CLEANING", "Limpeza"}, {"REPROGRAMMING", "Regravação"},
            {"FIRMWARE_UPDATE", "Atualização de firmware"}, {"HARNESS_REPLACEMENT", "Troca de chicote"}, {"OTHER", "Outro"}};
        try (var connection = database.connect(); var sql = connection.createStatement()) {
            sql.executeUpdate("INSERT INTO clients (id, legal_name, created_at, updated_at) VALUES (900, 'Cliente', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
            sql.executeUpdate("INSERT INTO products (id, sku, name, default_warranty_months, created_at, updated_at) VALUES (900, 'IV', 'Produto', 12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
            sql.executeUpdate("INSERT INTO rmas (id, code, client_id, product_id, purchase_date_unknown, entry_date, received_by, reported_failure, priority, status, created_at, updated_at) "
                + "VALUES (900, 'OS-2026-000900', 900, 900, TRUE, CURRENT_DATE, 'desk', 'Falha', 'MEDIUM', 'RECEIVED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
            for (int i = 0; i < types.length; i++) {
                sql.executeUpdate(INTERVENTION.formatted(900 + i, types[i][0], "1.250"));
            }
            assertThrows(SQLException.class, () -> sql.executeUpdate(INTERVENTION.formatted(950, "NULL", "1")));
        }

        PostgresTestDatabase.flyway(database).migrate();

        try (var connection = database.connect(); var sql = connection.createStatement()) {
            for (int i = 0; i < types.length; i++) {
                try (var rows = sql.executeQuery("SELECT type, hours FROM rma_interventions WHERE id = " + (900 + i))) {
                    rows.next();
                    assertEquals(types[i][1], rows.getString(1));
                    assertEquals("1.250", rows.getBigDecimal(2).toPlainString());
                }
            }
            sql.executeUpdate(INTERVENTION.formatted(960, "Troca de conector USB", "NULL"));
            try (var rows = sql.executeQuery("SELECT type, hours FROM rma_interventions WHERE id = 960")) {
                rows.next();
                assertEquals("Troca de conector USB", rows.getString(1));
                assertNull(rows.getBigDecimal(2));
            }
            assertThrows(SQLException.class, () -> sql.executeUpdate(INTERVENTION.formatted(961, "Tipo", "0")));
            assertThrows(SQLException.class, () -> sql.executeUpdate(INTERVENTION.formatted(962, "T".repeat(81), "1")));
            try (var rows = sql.executeQuery("SELECT character_maximum_length FROM information_schema.columns WHERE table_name = 'rma_interventions' AND column_name = 'type'")) {
                rows.next();
                assertEquals(80, rows.getInt(1));
            }
        }
    }
}
