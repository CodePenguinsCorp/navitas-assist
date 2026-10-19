package br.com.navitasassist.migration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.HashSet;
import java.util.Set;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

class DatabaseMigrationTest {

    private static final String USER = "sa";
    private static final String PASSWORD = "";

    @Test
    void createsSchemaAndSupportsMultipleItemsPerRma() throws SQLException {
        String url = "jdbc:h2:mem:migration_empty;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1";

        int executedMigrations = Flyway.configure().dataSource(url, USER, PASSWORD).load().migrate().migrationsExecuted;

        assertEquals(1, executedMigrations);
        try (Connection connection = DriverManager.getConnection(url, USER, PASSWORD)) {
            assertTrue(tableExists(connection, "rmas"));
            assertTrue(tableExists(connection, "rma_items"));
            assertTrue(tableExists(connection, "rma_assignment_history"));
            assertEquals(1000, columnSize(connection, "rmas", "reported_failure"));
            assertEquals(500, columnSize(connection, "rmas", "received_accessories"));
            assertEquals(500, columnSize(connection, "rmas", "physical_condition"));
            assertFalse(columnExists(connection, "rmas", "warranty_status"));
            assertFalse(columnExists(connection, "rmas", "warranty_overridden"));
            assertFalse(columnExists(connection, "rmas", "warranty_justification"));
            assertFalse(columnExists(connection, "rmas", "warranty_updated_by"));
            assertFalse(columnExists(connection, "rmas", "warranty_updated_at"));
            assertTrue(columnExists(connection, "rma_items", "warranty_months"));
            assertTrue(columnExists(connection, "rmas", "assignee_id"));
            assertEquals(600, columnSize(connection, "rmas", "repair_summary"));
            assertEquals(600, columnSize(connection, "rmas", "replaced_parts_summary"));
            assertEquals(800, columnSize(connection, "rmas", "test_summary"));
            assertEquals(
                Set.of(
                    "idx_rma_items_rma_id",
                    "idx_rma_items_product_id",
                    "idx_rma_items_batch_number",
                    "idx_rma_items_serial_number"
                ),
                applicationIndexes(connection, "rma_items")
            );
            assertEquals(
                Set.of("idx_rma_assignment_history_rma_id"),
                applicationIndexes(connection, "rma_assignment_history")
            );

            long clientId = insertClient(connection);
            long productId = insertProduct(connection);
            long rmaId = insertRma(connection, clientId, productId);
            insertItem(connection, rmaId, productId, "SERIAL-A");
            insertItem(connection, rmaId, productId, "SERIAL-B");

            assertEquals(2, count(connection, "rma_items"));
            assertThrows(SQLException.class, () -> insertItem(connection, 999999, productId, "ORPHAN"));
        }
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

    private int columnSize(Connection connection, String tableName, String columnName) throws SQLException {
        try (ResultSet columns = connection.getMetaData().getColumns(null, null, tableName, columnName)) {
            assertTrue(columns.next());
            return columns.getInt("COLUMN_SIZE");
        }
    }

    private boolean columnExists(Connection connection, String tableName, String columnName) throws SQLException {
        try (ResultSet columns = connection.getMetaData().getColumns(null, null, tableName, columnName)) {
            return columns.next();
        }
    }

    private long insertClient(Connection connection) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
            INSERT INTO clients (legal_name, created_at, updated_at)
            VALUES ('Cliente', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """, Statement.RETURN_GENERATED_KEYS)) {
            statement.executeUpdate();
            return generatedId(statement);
        }
    }

    private long insertProduct(Connection connection) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
            INSERT INTO products (sku, name, default_warranty_months, created_at, updated_at)
            VALUES ('NAV-25', 'Produto', 12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """, Statement.RETURN_GENERATED_KEYS)) {
            statement.executeUpdate();
            return generatedId(statement);
        }
    }

    private long insertRma(Connection connection, long clientId, long productId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
            INSERT INTO rmas (
                code, client_id, product_id, purchase_date_unknown, entry_date, received_by,
                reported_failure, priority, status, created_at, updated_at
            ) VALUES (
                'RMA-25', ?, ?, TRUE, DATE '2026-10-19', 'Técnico', 'Falha',
                'HIGH', 'RECEIVED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
            """, Statement.RETURN_GENERATED_KEYS)) {
            statement.setLong(1, clientId);
            statement.setLong(2, productId);
            statement.executeUpdate();
            return generatedId(statement);
        }
    }

    private void insertItem(Connection connection, long rmaId, long productId, String serialNumber) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
            INSERT INTO rma_items (rma_id, product_id, serial_number)
            VALUES (?, ?, ?)
            """)) {
            statement.setLong(1, rmaId);
            statement.setLong(2, productId);
            statement.setString(3, serialNumber);
            statement.executeUpdate();
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
}
