package br.com.navitasassist.migration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;

import br.com.navitasassist.support.PostgresTestDatabase;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.postgresql.util.PSQLException;

/**
 * Unicidade de texto livre e códigos na baseline PostgreSQL: valores que diferem só pela caixa colidem, com o nome do
 * índice que o código e as mensagens esperam; valores que diferem por acento coexistem (decisão Q4 do plano).
 */
class UniquenessCaseTest {

    private static PostgresTestDatabase.Coordinates database;

    @BeforeAll
    static void migrate() {
        database = PostgresTestDatabase.migrated("uniqueness");
    }

    @Test
    void productSkuIgnoresCase() throws SQLException {
        String insert = "INSERT INTO products (sku, name, default_warranty_months, created_at, updated_at) VALUES ('%s', 'Produto', 12, now(), now())";
        execute(insert.formatted("NAV-X1"));
        assertViolates("uk_products_sku", insert.formatted("nav-x1"));
        execute(insert.formatted("NAV-X1-B"));
    }

    @Test
    void profileNameAndLegacyCodeIgnoreCase() throws SQLException {
        String insert = "INSERT INTO access_profiles (name, legacy_code, created_at, updated_at) VALUES ('%s', %s, now(), now())";
        execute(insert.formatted("Supervisão", "'SUPERVISOR'"));
        assertViolates("uk_access_profiles_name", insert.formatted("SUPERVISÃO", "NULL"));
        assertViolates("uk_access_profiles_legacy_code", insert.formatted("Outro supervisor", "'supervisor'"));
        // Só a caixa é ignorada: o acento distingue os nomes.
        execute(insert.formatted("Supervisao", "NULL"));
        // Vários perfis sem código legado.
        execute(insert.formatted("Sem codigo 1", "NULL"));
        execute(insert.formatted("Sem codigo 2", "NULL"));
    }

    @Test
    void usernameAndEmailIgnoreCase() throws SQLException {
        String insert = """
            INSERT INTO user_accounts (username, full_name, password_hash, active, email, created_at, updated_at, profile_id)
            VALUES ('%s', 'Usuário', 'hash', TRUE, %s, now(), now(), (SELECT id FROM access_profiles WHERE legacy_code = 'VIEWER'))
            """;
        execute(insert.formatted("Maria.Silva", "'Maria@Example.invalid'"));
        assertViolates("uk_user_accounts_username", insert.formatted("maria.silva", "NULL"));
        assertViolates("uk_user_accounts_email", insert.formatted("maria.outra", "'maria@example.INVALID'"));
        execute(insert.formatted("sem.email.1", "NULL"));
        execute(insert.formatted("sem.email.2", "NULL"));
    }

    @Test
    void partCodeIgnoresCase() throws SQLException {
        String insert = """
            INSERT INTO parts (code, name, unit, minimum_stock, unit_cost, on_hand_quantity, reserved_quantity, active, created_at, updated_at)
            VALUES ('%s', 'Peça', 'un', 0, 0, 0, 0, TRUE, now(), now())
            """;
        execute(insert.formatted("CAP-100UF"));
        assertViolates("uk_parts_code", insert.formatted("cap-100uf"));
    }

    @Test
    void rmaCodeIgnoresCase() throws SQLException {
        execute("INSERT INTO clients (legal_name, created_at, updated_at) VALUES ('Cliente unicidade', now(), now())");
        execute("INSERT INTO products (sku, name, default_warranty_months, created_at, updated_at) VALUES ('UNIQ-RMA', 'Produto', 12, now(), now())");
        String insert = """
            INSERT INTO rmas (code, client_id, product_id, purchase_date_unknown, entry_date, received_by, reported_failure, priority, status, created_at, updated_at)
            VALUES ('%s', (SELECT max(id) FROM clients), (SELECT id FROM products WHERE sku = 'UNIQ-RMA'), TRUE, CURRENT_DATE, 'desk', 'Falha', 'LOW', 'RECEIVED', now(), now())
            """;
        execute(insert.formatted("RMA-2026-0001"));
        assertViolates("uk_rmas_code", insert.formatted("rma-2026-0001"));
    }

    @Test
    void kanbanViewNameIgnoresCasePerOwner() throws SQLException {
        String user = """
            INSERT INTO user_accounts (username, full_name, password_hash, active, created_at, updated_at, profile_id)
            VALUES ('%s', 'Dono', 'hash', TRUE, now(), now(), (SELECT id FROM access_profiles WHERE legacy_code = 'TECHNICIAN'))
            """;
        execute(user.formatted("dono.a"));
        execute(user.formatted("dono.b"));
        String view = """
            INSERT INTO kanban_views (owner_id, name, is_default, unassigned_only, created_at, updated_at)
            VALUES ((SELECT id FROM user_accounts WHERE username = '%s'), '%s', FALSE, FALSE, now(), now())
            """;
        execute(view.formatted("dono.a", "Urgentes"));
        assertViolates("uk_kanban_views_owner_name", view.formatted("dono.a", "URGENTES"));
        execute(view.formatted("dono.b", "urgentes"));
    }

    private static void execute(String sql) throws SQLException {
        try (Connection connection = database.connect(); Statement statement = connection.createStatement()) {
            statement.executeUpdate(sql);
        }
    }

    private static void assertViolates(String constraint, String sql) {
        assertThatThrownBy(() -> execute(sql))
            .isInstanceOfSatisfying(PSQLException.class, error -> {
                assertThat(error.getSQLState()).isEqualTo("23505");
                assertThat(error.getServerErrorMessage()).isNotNull();
                assertThat(error.getServerErrorMessage().getConstraint()).isEqualTo(constraint);
            });
    }
}
