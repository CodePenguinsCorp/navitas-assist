package br.com.navitasassist.migration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import br.com.navitasassist.support.PostgresTestDatabase;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

/** Tipo de falha e causa viram texto livre (80) e os códigos antigos passam para os textos em português. */
class DiagnosisFreeTextMigrationTest {
    private static final String RMA = "INSERT INTO rmas (id, code, client_id, product_id, purchase_date_unknown, entry_date, received_by, reported_failure, priority, status, created_at, updated_at) "
        + "VALUES (%d, 'OS-2026-%06d', 900, 900, TRUE, CURRENT_DATE, 'desk', 'Falha', 'MEDIUM', 'RECEIVED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)";

    @Test
    void convertsOldCodesToPortugueseTextAndAcceptsFreeText() throws Exception {
        PostgresTestDatabase.Coordinates database = PostgresTestDatabase.create("diagnosis_free_text");
        Flyway.configure().dataSource(database.url(), database.user(), database.password())
            .locations("classpath:db/migration").target("2").load().migrate();
        String[][] types = {{"POWER_SUPPLY", "Fonte de alimentação"}, {"PWM", "PWM"}, {"SENSOR", "Sensor"}, {"COMMUNICATION", "Comunicação"},
            {"DISPLAY", "Display"}, {"FIRMWARE", "Firmware"}, {"MECHANICAL", "Mecânica"}, {"OTHER", "Outro"}};
        String[][] causes = {{"COMPONENT", "Componente"}, {"SOLDER", "Solda"}, {"HUMIDITY", "Umidade"}, {"OVERLOAD", "Sobrecarga"},
            {"ESD", "ESD"}, {"INCORRECT_USAGE", "Uso incorreto"}, {"OTHER", "Outro"}};
        try (var connection = database.connect(); var sql = connection.createStatement()) {
            sql.executeUpdate("INSERT INTO clients (id, legal_name, created_at, updated_at) VALUES (900, 'Cliente', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
            sql.executeUpdate("INSERT INTO products (id, sku, name, default_warranty_months, created_at, updated_at) VALUES (900, 'DG', 'Produto', 12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
            for (int i = 0; i < types.length; i++) {
                sql.executeUpdate(RMA.formatted(900 + i, i + 1));
                String cause = i < causes.length ? "'" + causes[i][0] + "'" : "NULL";
                sql.executeUpdate(("INSERT INTO diagnoses (id, rma_id, found_failure, failure_type, probable_cause, diagnosed_at, technician_name, created_at, updated_at) "
                    + "VALUES (%d, %d, 'Falha', '%s', %s, CURRENT_DATE, 'Tec', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)").formatted(900 + i, 900 + i, types[i][0], cause));
            }
            sql.executeUpdate(RMA.formatted(990, 990));
            sql.executeUpdate("INSERT INTO diagnoses (id, rma_id, found_failure, diagnosed_at, technician_name, created_at, updated_at) "
                + "VALUES (990, 990, 'Sem classificação', CURRENT_DATE, 'Tec', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
        }

        PostgresTestDatabase.flyway(database).migrate();

        try (var connection = database.connect(); var sql = connection.createStatement()) {
            for (int i = 0; i < types.length; i++) {
                try (var rows = sql.executeQuery("SELECT failure_type, probable_cause FROM diagnoses WHERE id = " + (900 + i))) {
                    rows.next();
                    assertEquals(types[i][1], rows.getString(1));
                    if (i < causes.length) {
                        assertEquals(causes[i][1], rows.getString(2));
                    } else {
                        assertNull(rows.getString(2));
                    }
                }
            }
            try (var rows = sql.executeQuery("SELECT failure_type, probable_cause FROM diagnoses WHERE id = 990")) {
                rows.next();
                assertNull(rows.getString(1));
                assertNull(rows.getString(2));
            }
            sql.executeUpdate("UPDATE diagnoses SET failure_type = 'Placa trincada na região do conector', probable_cause = 'Queda durante o transporte' WHERE id = 990");
            int checked = 0;
            try (var rows = sql.executeQuery("SELECT character_maximum_length FROM information_schema.columns WHERE table_name = 'diagnoses' AND column_name IN ('failure_type', 'probable_cause')")) {
                while (rows.next()) {
                    assertEquals(80, rows.getInt(1));
                    checked++;
                }
            }
            assertEquals(2, checked);
        }
    }
}
