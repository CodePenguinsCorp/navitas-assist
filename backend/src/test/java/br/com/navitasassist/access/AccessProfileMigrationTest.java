package br.com.navitasassist.access;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
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
 * Migração dos roles fixos para perfis (V8), num H2 próprio por teste.
 */
class AccessProfileMigrationTest {

    private static final String USER = "sa";
    private static final String PASSWORD = "";
    private static final List<String> LEGACY_CODES = List.of("ADMIN", "SERVICE_DESK", "TECHNICIAN", "VIEWER");

    @Test
    void seedsLegacyProfilesWithExactPermissions() throws SQLException {
        String url = newDatabase();
        migrateTo(url, "8");

        try (Connection connection = DriverManager.getConnection(url, USER, PASSWORD)) {
            assertEquals(
                Map.of("ADMIN", "Administrador", "SERVICE_DESK", "Atendimento", "TECHNICIAN", "Técnico", "VIEWER", "Consulta"),
                profileNamesByLegacyCode(connection));

            Map<String, Set<String>> permissions = permissionsByLegacyCode(connection);
            assertEquals(LegacyProfiles.PERMISSIONS, permissions);

            // Totais conferidos de forma independente da tabela usada pelos mocks.
            assertEquals(19, permissions.get("ADMIN").size());
            assertEquals(11, permissions.get("SERVICE_DESK").size());
            assertEquals(11, permissions.get("TECHNICIAN").size());
            assertEquals(5, permissions.get("VIEWER").size());
        }
    }

    @Test
    void mapsEveryLegacyRoleToItsProfile() throws SQLException {
        String url = newDatabase();
        migrateTo(url, "7");
        try (Connection connection = DriverManager.getConnection(url, USER, PASSWORD)) {
            for (String role : LEGACY_CODES) {
                try (PreparedStatement statement = connection.prepareStatement("""
                    INSERT INTO user_accounts (username, full_name, password_hash, role, active, created_at, updated_at)
                    VALUES (?, ?, 'hash', ?, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    """)) {
                    statement.setString(1, "mig." + role.toLowerCase());
                    statement.setString(2, "Migração " + role);
                    statement.setString(3, role);
                    statement.executeUpdate();
                }
            }
        }

        migrateTo(url, "8");

        try (Connection connection = DriverManager.getConnection(url, USER, PASSWORD)) {
            Map<String, String> profileByLegacyRole = new HashMap<>();
            try (Statement statement = connection.createStatement();
                 ResultSet rows = statement.executeQuery("""
                     SELECT u.role, p.legacy_code
                     FROM user_accounts u
                     JOIN access_profiles p ON p.id = u.profile_id
                     """)) {
                while (rows.next()) {
                    profileByLegacyRole.put(rows.getString(1), rows.getString(2));
                }
            }
            assertEquals(Map.of("ADMIN", "ADMIN", "SERVICE_DESK", "SERVICE_DESK", "TECHNICIAN", "TECHNICIAN", "VIEWER", "VIEWER"),
                profileByLegacyRole);

            assertThrows(SQLException.class, () -> {
                try (Statement statement = connection.createStatement()) {
                    statement.executeUpdate("""
                        INSERT INTO user_accounts (username, full_name, password_hash, role, active, created_at, updated_at)
                        VALUES ('mig.sem.perfil', 'Sem perfil', 'hash', 'VIEWER', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                        """);
                }
            });
        }
    }

    @Test
    void mapsRuleRolesToProfiles() throws SQLException {
        String url = newDatabase();
        migrateTo(url, "8");
        try (Connection connection = DriverManager.getConnection(url, USER, PASSWORD);
             Statement statement = connection.createStatement()) {
            // Regra editada com espaço depois da vírgula, como a conversão antiga aceitava.
            statement.executeUpdate("UPDATE notification_rules SET recipient_roles = 'ADMIN, VIEWER' WHERE event_type = 'SLA_WARNING'");
        }

        migrateTo(url, "9");

        try (Connection connection = DriverManager.getConnection(url, USER, PASSWORD)) {
            Map<String, Set<String>> recipients = new HashMap<>();
            try (Statement statement = connection.createStatement();
                 ResultSet rows = statement.executeQuery("""
                     SELECT r.event_type, p.name
                     FROM notification_rules r
                     LEFT JOIN notification_rule_recipient_profiles rp ON rp.rule_id = r.id
                     LEFT JOIN access_profiles p ON p.id = rp.profile_id
                     """)) {
                while (rows.next()) {
                    Set<String> names = recipients.computeIfAbsent(rows.getString(1), key -> new HashSet<>());
                    if (rows.getString(2) != null) names.add(rows.getString(2));
                }
            }
            assertEquals(Map.of(
                "RMA_CREATED", Set.of("Administrador", "Atendimento"),
                "RMA_ASSIGNED", Set.of(),
                "SLA_WARNING", Set.of("Administrador", "Consulta"),
                "SLA_OVERDUE", Set.of("Administrador", "Atendimento")), recipients);

            // Expand: a coluna legada continua existindo até a V10/V11.
            try (Statement statement = connection.createStatement();
                 ResultSet rows = statement.executeQuery("SELECT recipient_roles FROM notification_rules WHERE event_type = 'SLA_WARNING'")) {
                rows.next();
                assertEquals("ADMIN, VIEWER", rows.getString(1));
            }
        }
    }

    /** V10 (fim do uso pelo código): as colunas legadas aceitam NULL e o CHECK de role sai. */
    @Test
    void relaxesLegacyColumnsAtV10() throws SQLException {
        String url = newDatabase();
        migrateTo(url, "10");

        try (Connection connection = DriverManager.getConnection(url, USER, PASSWORD);
             Statement statement = connection.createStatement()) {
            statement.executeUpdate("""
                INSERT INTO user_accounts (username, full_name, password_hash, profile_id, active, created_at, updated_at)
                VALUES ('mig.sem.role', 'Sem role', 'hash', (SELECT id FROM access_profiles WHERE legacy_code = 'VIEWER'),
                        TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """);
            try (ResultSet rows = statement.executeQuery("SELECT role FROM user_accounts WHERE username = 'mig.sem.role'")) {
                rows.next();
                assertNull(rows.getString(1));
            }

            assertEquals(4, statement.executeUpdate("UPDATE notification_rules SET recipient_roles = NULL"));

            try (ResultSet rows = statement.executeQuery("""
                SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
                WHERE UPPER(CONSTRAINT_NAME) = 'CK_USER_ACCOUNTS_ROLE'
                """)) {
                rows.next();
                assertEquals(0, rows.getInt(1));
            }

            // Um role fora da lista antiga não é mais recusado pelo banco: a coluna é legada e sem uso.
            statement.executeUpdate("UPDATE user_accounts SET role = 'QUALQUER' WHERE username = 'mig.sem.role'");
        }
    }

    private static String newDatabase() {
        return "jdbc:h2:mem:mig_" + UUID.randomUUID().toString().replace("-", "") + ";MODE=MySQL;DB_CLOSE_DELAY=-1";
    }

    private static void migrateTo(String url, String target) {
        Flyway.configure()
            .dataSource(url, USER, PASSWORD)
            .locations("classpath:db/migration")
            .target(target)
            .load()
            .migrate();
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
