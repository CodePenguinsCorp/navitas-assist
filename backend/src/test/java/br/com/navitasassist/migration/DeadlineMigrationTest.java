package br.com.navitasassist.migration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Types;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

/** V2: data limite do RMA, filtro de prazo das visualizações e fim de todas as linhas SLA_*. */
class DeadlineMigrationTest {

    private static final String USER = "sa";
    private static final String PASSWORD = "";

    @Test
    void addsDeadlineSchema() throws SQLException {
        String url = newDatabase();
        migrateTo(url, "2");

        try (Connection connection = DriverManager.getConnection(url, USER, PASSWORD); Statement statement = connection.createStatement()) {
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
    void removesEverySlaRowAndKeepsTheOtherRules() throws SQLException {
        String url = newDatabase();
        migrateTo(url, "1");

        try (Connection connection = DriverManager.getConnection(url, USER, PASSWORD); Statement statement = connection.createStatement()) {
            long userId = insertUser(statement, "tecnico.sla");
            statement.executeUpdate("INSERT INTO notification_mutes (user_id, event_type, created_at) VALUES (" + userId + ", 'SLA_WARNING', CURRENT_TIMESTAMP)");
            statement.executeUpdate("INSERT INTO notification_mutes (user_id, event_type, created_at) VALUES (" + userId + ", 'RMA_CREATED', CURRENT_TIMESTAMP)");
            for (String type : List.of("SLA_OVERDUE", "RMA_CREATED")) {
                statement.executeUpdate("INSERT INTO notification_events (event_key, event_type, status, recipient_count, occurred_at) VALUES ('KEY-" + type + "', '" + type + "', 'PROCESSED', 1, CURRENT_TIMESTAMP)");
                statement.executeUpdate("""
                    INSERT INTO notifications (event_id, recipient_id, event_type, severity, title, message, created_at, email_status)
                    SELECT id, %d, event_type, 'INFO', 'Título', 'Mensagem', CURRENT_TIMESTAMP, 'NOT_REQUESTED'
                    FROM notification_events WHERE event_key = 'KEY-%s'
                    """.formatted(userId, type));
            }
        }

        migrateTo(url, "2");

        try (Connection connection = DriverManager.getConnection(url, USER, PASSWORD)) {
            assertEquals(Set.of("RMA_CREATED", "RMA_ASSIGNED"), strings(connection, "SELECT event_type FROM notification_rules"));
            assertEquals(0, strings(connection, """
                SELECT CAST(rp.rule_id AS VARCHAR(20)) FROM notification_rule_recipient_profiles rp
                LEFT JOIN notification_rules r ON r.id = rp.rule_id WHERE r.id IS NULL
                """).size());
            assertEquals(Set.of("ADMIN", "SERVICE_DESK"), strings(connection, """
                SELECT p.legacy_code FROM notification_rule_recipient_profiles rp
                JOIN notification_rules r ON r.id = rp.rule_id JOIN access_profiles p ON p.id = rp.profile_id
                WHERE r.event_type = 'RMA_CREATED'
                """));
            assertEquals(Set.of("RMA_CREATED"), strings(connection, "SELECT event_type FROM notification_mutes"));
            assertEquals(Set.of("RMA_CREATED"), strings(connection, "SELECT event_type FROM notifications"));
            assertEquals(Set.of("RMA_CREATED"), strings(connection, "SELECT event_type FROM notification_events"));
        }
    }

    private static String newDatabase() {
        return "jdbc:h2:mem:deadline_" + UUID.randomUUID().toString().replace("-", "") + ";MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1";
    }

    private static void migrateTo(String url, String version) {
        Flyway.configure().dataSource(url, USER, PASSWORD).locations("classpath:db/migration").target(version).load().migrate();
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
