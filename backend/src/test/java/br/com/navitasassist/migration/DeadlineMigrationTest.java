package br.com.navitasassist.migration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Types;
import java.util.HashSet;
import java.util.Set;

import br.com.navitasassist.support.PostgresTestDatabase;
import org.junit.jupiter.api.Test;

/** Data limite do RMA, filtro de prazo das visualizações e ausência dos alertas SLA_* no schema final da baseline. */
class DeadlineMigrationTest {

    @Test
    void hasDeadlineSchema() throws SQLException {
        PostgresTestDatabase.Coordinates database = PostgresTestDatabase.migrated("deadline");

        try (Connection connection = database.connect(); Statement statement = connection.createStatement()) {
            assertEquals(Types.DATE, columnType(connection, "rmas", "due_date"));
            assertEquals(Set.of("id", "rma_id", "previous_due_date", "new_due_date", "changed_by", "changed_at"), columns(connection, "rma_due_date_history"));
            assertTrue(indexes(connection, "rma_due_date_history").contains("idx_rma_due_date_history_rma_id"));

            long ownerId = insertUser(statement, "dono.visao");
            statement.executeUpdate(viewInsert(ownerId, "Perto", "'DUE_SOON'"));
            statement.executeUpdate(viewInsert(ownerId, "Todos", "NULL"));
            assertThrows(SQLException.class, () -> statement.executeUpdate(viewInsert(ownerId, "Encerrados", "'CLOSED'")));
        }
    }

    @Test
    void seedsNoSlaRules() throws SQLException {
        PostgresTestDatabase.Coordinates database = PostgresTestDatabase.migrated("deadline_sla");

        try (Connection connection = database.connect()) {
            assertEquals(Set.of("RMA_CREATED", "RMA_ASSIGNED", "RMA_BLOCKED", "PART_PENDING", "TEST_FAILED"),
                strings(connection, "SELECT event_type FROM notification_rules"));
            assertEquals(0, strings(connection, """
                SELECT CAST(rp.rule_id AS VARCHAR(20)) FROM notification_rule_recipient_profiles rp
                LEFT JOIN notification_rules r ON r.id = rp.rule_id WHERE r.id IS NULL
                """).size());
            assertEquals(Set.of("ADMIN", "SERVICE_DESK"), strings(connection, """
                SELECT p.legacy_code FROM notification_rule_recipient_profiles rp
                JOIN notification_rules r ON r.id = rp.rule_id JOIN access_profiles p ON p.id = rp.profile_id
                WHERE r.event_type = 'RMA_CREATED'
                """));
        }
    }

    private static long insertUser(Statement statement, String username) throws SQLException {
        statement.executeUpdate("""
            INSERT INTO user_accounts (username, full_name, password_hash, active, created_at, updated_at, profile_id)
            VALUES ('%s', 'Usuário', 'hash', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
                    (SELECT id FROM access_profiles WHERE legacy_code = 'TECHNICIAN'))
            """.formatted(username));
        try (ResultSet row = statement.executeQuery("SELECT id FROM user_accounts WHERE username = '" + username + "'")) {
            row.next();
            return row.getLong(1);
        }
    }

    private static String viewInsert(long ownerId, String name, String deadline) {
        return """
            INSERT INTO kanban_views (owner_id, name, is_default, unassigned_only, deadline_status, created_at, updated_at)
            VALUES (%d, '%s', FALSE, FALSE, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """.formatted(ownerId, name, deadline);
    }

    private static int columnType(Connection connection, String table, String column) throws SQLException {
        try (ResultSet columns = connection.getMetaData().getColumns(null, null, table, column)) {
            assertTrue(columns.next(), table + "." + column);
            return columns.getInt("DATA_TYPE");
        }
    }

    private static Set<String> columns(Connection connection, String table) throws SQLException {
        Set<String> names = new HashSet<>();
        try (ResultSet columns = connection.getMetaData().getColumns(null, null, table, null)) {
            while (columns.next()) {
                names.add(columns.getString("COLUMN_NAME"));
            }
        }
        return names;
    }

    private static Set<String> indexes(Connection connection, String table) throws SQLException {
        Set<String> names = new HashSet<>();
        try (ResultSet result = connection.getMetaData().getIndexInfo(null, null, table, false, false)) {
            while (result.next()) {
                if (result.getString("INDEX_NAME") != null) names.add(result.getString("INDEX_NAME"));
            }
        }
        return names;
    }

    private static Set<String> strings(Connection connection, String sql) throws SQLException {
        Set<String> values = new HashSet<>();
        try (Statement statement = connection.createStatement(); ResultSet rows = statement.executeQuery(sql)) {
            while (rows.next()) {
                values.add(rows.getString(1));
            }
        }
        return values;
    }
}
