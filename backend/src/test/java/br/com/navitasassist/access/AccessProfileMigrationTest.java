package br.com.navitasassist.access;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

/**
 * Perfis, permissões e regras de notificação semeados pelas migrações (V1 e a limpeza do SLA na V2), num H2 próprio por teste.
 */
class AccessProfileMigrationTest {

    private static final String USER = "sa";
    private static final String PASSWORD = "";

    @Test
    void seedsLegacyProfilesWithExactPermissions() throws SQLException {
        String url = migratedDatabase();

        try (Connection connection = DriverManager.getConnection(url, USER, PASSWORD)) {
            assertEquals(
                Map.of("ADMIN", "Administrador", "SERVICE_DESK", "Atendimento", "TECHNICIAN", "Técnico", "VIEWER", "Consulta"),
                profileNamesByLegacyCode(connection));

            Map<String, Set<String>> permissions = permissionsByLegacyCode(connection);
            assertEquals(LegacyProfiles.PERMISSIONS, permissions);

            // Totais conferidos de forma independente da tabela usada pelos mocks.
            assertEquals(20, permissions.get("ADMIN").size());
            assertEquals(Set.of("ADMIN"), permissions.entrySet().stream()
                .filter(entry -> entry.getValue().contains("cadastros.importar"))
                .map(Map.Entry::getKey).collect(java.util.stream.Collectors.toSet()));
            assertEquals(11, permissions.get("SERVICE_DESK").size());
            assertEquals(11, permissions.get("TECHNICIAN").size());
            assertEquals(5, permissions.get("VIEWER").size());
        }
    }

    @Test
    void seedsNotificationRulesWithProfileRecipients() throws SQLException {
        String url = migratedDatabase();

        try (Connection connection = DriverManager.getConnection(url, USER, PASSWORD)) {
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
                     SELECT r.event_type, p.legacy_code
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
                "RMA_CREATED", Set.of("ADMIN", "SERVICE_DESK"),
                "RMA_ASSIGNED", Set.of()), recipients);
        }
    }

    /** As colunas legadas dos roles fixos não fazem parte da migração-base. */
    @Test
    void hasNoLegacyRoleColumns() throws SQLException {
        String url = migratedDatabase();

        try (Connection connection = DriverManager.getConnection(url, USER, PASSWORD)) {
            assertEquals(0, count(connection, """
                SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE (UPPER(TABLE_NAME) = 'USER_ACCOUNTS' AND UPPER(COLUMN_NAME) = 'ROLE')
                   OR (UPPER(TABLE_NAME) = 'NOTIFICATION_RULES' AND UPPER(COLUMN_NAME) = 'RECIPIENT_ROLES')
                """));
            assertEquals(0, count(connection, """
                SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE UPPER(CONSTRAINT_NAME) = 'CK_USER_ACCOUNTS_ROLE'
                """));
        }
    }

    @Test
    void requiresProfileForEveryUser() throws SQLException {
        String url = migratedDatabase();

        try (Connection connection = DriverManager.getConnection(url, USER, PASSWORD);
             Statement statement = connection.createStatement()) {
            statement.executeUpdate("""
                INSERT INTO user_accounts (username, full_name, password_hash, active, created_at, updated_at, profile_id)
                VALUES ('base.admin', 'Administrador', 'hash', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
                        (SELECT id FROM access_profiles WHERE legacy_code = 'ADMIN'))
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

    private static String migratedDatabase() {
        String url = "jdbc:h2:mem:mig_" + UUID.randomUUID().toString().replace("-", "") + ";MODE=MySQL;DB_CLOSE_DELAY=-1";
        Flyway.configure().dataSource(url, USER, PASSWORD).locations("classpath:db/migration").load().migrate();
        return url;
    }

    private static int count(Connection connection, String sql) throws SQLException {
        try (Statement statement = connection.createStatement(); ResultSet rows = statement.executeQuery(sql)) {
            rows.next();
            return rows.getInt(1);
        }
    }

    private static Map<String, String> profileNamesByLegacyCode(Connection connection) throws SQLException {
        Map<String, String> names = new HashMap<>();
        try (Statement statement = connection.createStatement();
             ResultSet rows = statement.executeQuery("SELECT legacy_code, name FROM access_profiles")) {
            while (rows.next()) {
                names.put(rows.getString(1), rows.getString(2));
            }
        }
        return names;
    }

    private static Map<String, Set<String>> permissionsByLegacyCode(Connection connection) throws SQLException {
        Map<String, Set<String>> permissions = new HashMap<>();
        try (Statement statement = connection.createStatement();
             ResultSet rows = statement.executeQuery("""
                 SELECT p.legacy_code, pp.permission
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
