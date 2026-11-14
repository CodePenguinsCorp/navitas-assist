package br.com.navitasassist.migration;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

import javax.sql.DataSource;

import br.com.navitasassist.support.PostgresTestDatabase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * Equivalência entre o schema que o Hibernate geraria a partir das entidades (banco próprio, Flyway desligado,
 * {@code ddl-auto=create}) e o da baseline do Flyway. Complementa o {@code validate}, que não acusa coluna a mais
 * nem NOT NULL faltando: aqui toda tabela e coluna mapeada tem de existir com o mesmo tipo, toda coluna NOT NULL nas
 * entidades tem de ser NOT NULL no banco e nenhuma coluna da baseline pode ficar sem mapeamento.
 */
@SpringBootTest(properties = {
    "navitas.test.database=hibernate_schema",
    "spring.flyway.enabled=false",
    "spring.jpa.hibernate.ddl-auto=create"
})
@ActiveProfiles("test")
class SchemaEquivalenceTest {

    private static final String COLUMNS = """
        SELECT table_name, column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name <> 'flyway_schema_history'
        """;

    @Autowired
    DataSource hibernateSchema;

    @Test
    void flywayBaselineMatchesTheEntityMappings() throws SQLException {
        Map<String, Column> expected;
        try (Connection connection = hibernateSchema.getConnection()) {
            expected = columns(connection);
        }
        Map<String, Column> actual;
        try (Connection connection = PostgresTestDatabase.migrated("flyway_schema").connect()) {
            actual = columns(connection);
        }

        assertThat(tables(actual)).as("tabelas").isEqualTo(tables(expected));
        assertThat(actual.keySet()).as("colunas").isEqualTo(expected.keySet());
        Set<String> typeDifferences = new TreeSet<>();
        Set<String> nullabilityDifferences = new TreeSet<>();
        expected.forEach((key, entity) -> {
            Column database = actual.get(key);
            if (!entity.type().equals(database.type())) {
                typeDifferences.add(key + ": entidade " + entity.type() + ", banco " + database.type());
            }
            if (!entity.nullable() && database.nullable()) {
                nullabilityDifferences.add(key);
            }
        });
        assertThat(typeDifferences).as("tipos").isEmpty();
        assertThat(nullabilityDifferences).as("NOT NULL nas entidades e anulável no banco").isEmpty();
    }

    private record Column(String type, boolean nullable) {
    }

    private static Map<String, Column> columns(Connection connection) throws SQLException {
        Map<String, Column> columns = new TreeMap<>();
        try (Statement statement = connection.createStatement(); ResultSet rows = statement.executeQuery(COLUMNS)) {
            while (rows.next()) {
                columns.put(rows.getString(1) + "." + rows.getString(2), new Column(rows.getString(3), "YES".equals(rows.getString(4))));
            }
        }
        return columns;
    }

    private static Set<String> tables(Map<String, Column> columns) {
        Set<String> tables = new TreeSet<>();
        columns.keySet().forEach(key -> tables.add(key.substring(0, key.indexOf('.'))));
        return tables;
    }
}
