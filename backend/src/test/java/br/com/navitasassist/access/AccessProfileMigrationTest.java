package br.com.navitasassist.access;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import br.com.navitasassist.support.PostgresTestDatabase;
import org.junit.jupiter.api.Test;

/**
 * Perfis, permissões e regras de notificação semeados pela baseline V1, num PostgreSQL próprio por teste.
 */
class AccessProfileMigrationTest {

    @Test
    void seedsOnlyAdministratorWithAllPermissions() throws SQLException {
        try (Connection connection = migratedDatabase().connect()) {
            assertEquals(Map.of("Administrador", "Administrador"), profileNamesByName(connection));
            assertEquals(Map.of("Administrador", Permission.codes(Set.of(Permission.values()))),
                permissionsByName(connection));
            assertEquals(0, count(connection, "SELECT count(*) FROM information_schema.columns WHERE table_name = 'access_profiles' AND column_name = 'system_code'"));
            assertEquals(0, count(connection, "SELECT count(*) FROM pg_indexes WHERE indexname = 'uk_access_profiles_system_code'"));
        }
    }

    @Test
    void seedsNotificationRulesWithProfileRecipients() throws SQLException {
        PostgresTestDatabase.Coordinates database = migratedDatabase();

        try (Connection connection = database.connect()) {
            Map<String, String> rules = new HashMap<>();
            try (Statement statement = connection.createStatement();
                 ResultSet rows = statement.executeQuery("""
                     SELECT event_type, enabled, severity, notify_assignee, email_enabled, user_mutable FROM notification_rules WHERE event_type IN ('RMA_CREATED', 'RMA_ASSIGNED')
                     """)) {
                while (rows.next()) {
                    rules.put(rows.getString(1), String.join(",", List.of(
                        String.valueOf(rows.getBoolean(2)), rows.getString(3), String.valueOf(rows.getBoolean(4)),
                        String.valueOf(rows.getBoolean(5)), String.valueOf(rows.getBoolean(6)))));
                }
            }
            assertEquals(Map.of(
                "RMA_CREATED", "true,INFO,false,false,true",
                "RMA_ASSIGNED", "true,INFO,true,false,false"), rules);

            Map<String, Set<String>> recipients = new HashMap<>();
            try (Statement statement = connection.createStatement();
                 ResultSet rows = statement.executeQuery("""
                     SELECT r.event_type, p.name
                     FROM notification_rules r
                     LEFT JOIN notification_rule_recipient_profiles rp ON rp.rule_id = r.id
                     LEFT JOIN access_profiles p ON p.id = rp.profile_id
                     WHERE r.event_type IN ('RMA_CREATED', 'RMA_ASSIGNED')
                     """)) {
                while (rows.next()) {
                    Set<String> codes = recipients.computeIfAbsent(rows.getString(1), key -> new HashSet<>());
                    if (rows.getString(2) != null) codes.add(rows.getString(2));
                }
            }
            assertEquals(Map.of(
                "RMA_CREATED", Set.of("Administrador"),
                "RMA_ASSIGNED", Set.of()), recipients);
        }
    }

    @Test
    void requiresProfileForEveryUser() throws SQLException {
        PostgresTestDatabase.Coordinates database = migratedDatabase();

        try (Connection connection = database.connect();
             Statement statement = connection.createStatement()) {
            statement.executeUpdate("""
                INSERT INTO user_accounts (username, full_name, password_hash, active, created_at, updated_at, profile_id)
                VALUES ('base.admin', 'Administrador', 'hash', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
                        (SELECT id FROM access_profiles WHERE name = 'Administrador'))
                """);
            assertThrows(SQLException.class, () -> statement.executeUpdate("""
                INSERT INTO user_accounts (username, full_name, password_hash, active, created_at, updated_at)
                VALUES ('base.sem.perfil', 'Sem perfil', 'hash', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """));
            assertThrows(SQLException.class, () -> statement.executeUpdate("""
                INSERT INTO user_accounts (username, full_name, password_hash, active, created_at, updated_at, profile_id)
                VALUES ('base.perfil.inexistente', 'Perfil inexistente', 'hash', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 999999)
                """));
        }
    }

    private static PostgresTestDatabase.Coordinates migratedDatabase() {
        return PostgresTestDatabase.migrated("mig_profiles");
    }

    private static int count(Connection connection, String sql) throws SQLException {
        try (Statement statement = connection.createStatement(); ResultSet rows = statement.executeQuery(sql)) {
            rows.next();
            return rows.getInt(1);
        }
    }

    private static Map<String, String> profileNamesByName(Connection connection) throws SQLException {
        Map<String, String> names = new HashMap<>();
        try (Statement statement = connection.createStatement();
             ResultSet rows = statement.executeQuery("SELECT name, name FROM access_profiles")) {
            while (rows.next()) {
                names.put(rows.getString(1), rows.getString(2));
            }
        }
        return names;
    }

    private static Map<String, Set<String>> permissionsByName(Connection connection) throws SQLException {
        Map<String, Set<String>> permissions = new HashMap<>();
        try (Statement statement = connection.createStatement();
             ResultSet rows = statement.executeQuery("""
                 SELECT p.name, pp.permission
                 FROM access_profiles p
                 JOIN access_profile_permissions pp ON pp.profile_id = p.id
                 """)) {
            while (rows.next()) {
                permissions.computeIfAbsent(rows.getString(1), key -> new HashSet<>()).add(rows.getString(2));
            }
        }
        return permissions;
    }
}
