package br.com.navitasassist.migration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.Set;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;

class DatabaseMigrationTest {

    private static final String USER = "sa";
    private static final String PASSWORD = "";

    @Test
    void createsVersionedSchemaInEmptyDatabase() throws SQLException {
        String url = databaseUrl("empty");

        int executedMigrations = flyway(url).migrate().migrationsExecuted;

        assertEquals(2, executedMigrations);
        try (Connection connection = DriverManager.getConnection(url, USER, PASSWORD)) {
            assertTrue(tableExists(connection, "rmas"));
            assertTrue(tableExists(connection, "rma_items"));
            assertTrue(tableExists(connection, "flyway_schema_history"));
            assertEquals(
                Set.of(
                    "idx_rma_items_rma_id",
                    "idx_rma_items_product_id",
                    "idx_rma_items_batch_number",
                    "idx_rma_items_serial_number"
                ),
                applicationIndexes(connection, "rma_items")
            );
        }
    }

    @Test
    void baselinesExistingDatabaseAndMigratesLegacyRmaWithoutDataLoss() throws SQLException {
        String url = databaseUrl("legacy");
        Flyway.configure()
            .dataSource(url, USER, PASSWORD)
            .target(MigrationVersion.fromVersion("1"))
            .load()
            .migrate();

        long productId;
        long rmaId;
        try (Connection connection = DriverManager.getConnection(url, USER, PASSWORD)) {
            try (Statement statement = connection.createStatement()) {
                statement.execute("DROP TABLE flyway_schema_history");
            }
            long clientId = insertClient(connection);
            productId = insertProduct(connection);
            rmaId = insertLegacyRma(connection, clientId, productId);
        }

        int executedMigrations = flyway(url).migrate().migrationsExecuted;

        assertEquals(1, executedMigrations);
        try (Connection connection = DriverManager.getConnection(url, USER, PASSWORD)) {
            try (PreparedStatement statement = connection.prepareStatement("""
                SELECT product_id, batch_number, serial_number, manufactured_at
                FROM rma_items
                WHERE rma_id = ?
                """)) {
                statement.setLong(1, rmaId);
                try (ResultSet result = statement.executeQuery()) {
                    assertTrue(result.next());
                    assertEquals(productId, result.getLong("product_id"));
                    assertEquals("LOTE-25", result.getString("batch_number"));
                    assertEquals("SERIAL-25", result.getString("serial_number"));
                    assertEquals(LocalDate.of(2026, 1, 15), result.getObject("manufactured_at", LocalDate.class));
                }
            }

            assertEquals(1, count(connection, "rmas"));
            assertEquals(1, count(connection, "rma_items"));
            assertLegacyRmaPreserved(connection, rmaId, productId);
            insertAdditionalItem(connection, rmaId, productId);
            assertEquals(2, count(connection, "rma_items"));
            assertThrows(SQLException.class, () -> insertOrphanItem(connection, productId));
        }
    }

    private Flyway flyway(String url) {
        return Flyway.configure()
            .dataSource(url, USER, PASSWORD)
            .baselineOnMigrate(true)
            .baselineVersion(MigrationVersion.fromVersion("1"))
            .load();
    }

    private String databaseUrl(String name) {
        return "jdbc:h2:mem:migration_" + name + ";MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1";
    }

    private boolean tableExists(Connection connection, String tableName) throws SQLException {
        try (ResultSet tables = connection.getMetaData().getTables(null, null, tableName, new String[] { "TABLE" })) {
            return tables.next();
        }
    }

    private Set<String> applicationIndexes(Connection connection, String tableName) throws SQLException {
        Set<String> indexes = new HashSet<>();
        try (ResultSet result = connection.getMetaData().getIndexInfo(null, null, tableName, false, false)) {
            while (result.next()) {
                String indexName = result.getString("INDEX_NAME");
                if (indexName != null && indexName.startsWith("idx_")) {
                    indexes.add(indexName);
                }
            }
        }
        return indexes;
    }

    private long insertClient(Connection connection) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
            INSERT INTO clients (legal_name, created_at, updated_at)
            VALUES ('Cliente legado', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """, Statement.RETURN_GENERATED_KEYS)) {
            statement.executeUpdate();
            return generatedId(statement);
        }
    }

    private long insertProduct(Connection connection) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
            INSERT INTO products (sku, name, default_warranty_months, created_at, updated_at)
            VALUES ('NAV-25', 'Produto legado', 12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """, Statement.RETURN_GENERATED_KEYS)) {
            statement.executeUpdate();
            return generatedId(statement);
        }
    }

    private long insertLegacyRma(Connection connection, long clientId, long productId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
            INSERT INTO rmas (
                code, client_id, product_id, batch_number, serial_number, manufactured_at,
                purchase_date_unknown, entry_date, received_by, reported_failure, priority,
                status, warranty_status, warranty_overridden, created_at, updated_at
            ) VALUES (
                'RMA-LEGACY-25', ?, ?, 'LOTE-25', 'SERIAL-25', DATE '2026-01-15',
                TRUE, DATE '2026-10-19', 'Técnico', 'Falha legada', 'HIGH',
                'RECEIVED', 'PENDING', FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
            """, Statement.RETURN_GENERATED_KEYS)) {
            statement.setLong(1, clientId);
            statement.setLong(2, productId);
            statement.executeUpdate();
            return generatedId(statement);
        }
    }

    private long generatedId(PreparedStatement statement) throws SQLException {
        try (ResultSet keys = statement.getGeneratedKeys()) {
            assertTrue(keys.next());
            return keys.getLong(1);
        }
    }

    private int count(Connection connection, String tableName) throws SQLException {
        try (Statement statement = connection.createStatement();
             ResultSet result = statement.executeQuery("SELECT COUNT(*) FROM " + tableName)) {
            result.next();
            return result.getInt(1);
        }
    }

    private void assertLegacyRmaPreserved(Connection connection, long rmaId, long productId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
            SELECT product_id, batch_number, serial_number, manufactured_at
            FROM rmas
            WHERE id = ?
            """)) {
            statement.setLong(1, rmaId);
            try (ResultSet result = statement.executeQuery()) {
                assertTrue(result.next());
                assertEquals(productId, result.getLong("product_id"));
                assertEquals("LOTE-25", result.getString("batch_number"));
                assertEquals("SERIAL-25", result.getString("serial_number"));
                assertEquals(LocalDate.of(2026, 1, 15), result.getObject("manufactured_at", LocalDate.class));
            }
        }
    }

    private void insertAdditionalItem(Connection connection, long rmaId, long productId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
            INSERT INTO rma_items (rma_id, product_id, serial_number)
            VALUES (?, ?, 'SERIAL-25-B')
            """)) {
            statement.setLong(1, rmaId);
            statement.setLong(2, productId);
            statement.executeUpdate();
        }
    }

    private void insertOrphanItem(Connection connection, long productId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
            INSERT INTO rma_items (rma_id, product_id)
            VALUES (999999, ?)
            """)) {
            statement.setLong(1, productId);
            statement.executeUpdate();
        }
    }
}
