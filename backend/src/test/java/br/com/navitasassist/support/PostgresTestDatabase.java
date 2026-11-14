package br.com.navitasassist.support;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * PostgreSQL real para os testes, um por JVM.
 *
 * <p>Com {@code TEST_DB_URL}, {@code TEST_DB_USER} e {@code TEST_DB_PASSWORD} definidas (CI, com o Postgres como
 * serviço), usa esse banco e não sobe contêiner. Sem elas, sobe um {@code postgres:16-alpine} pelo Testcontainers,
 * compartilhado por todas as classes da execução e parado ao fim da JVM.
 *
 * <p>{@link #create(String)} cria um banco vazio no mesmo servidor ({@code CREATE DATABASE}), para testes que aplicam o
 * Flyway à mão ou precisam de um schema só seu. O usuário precisa poder criar bancos (dono do servidor no CI).
 */
public final class PostgresTestDatabase {

    public static final String IMAGE = "postgres:16-alpine";
    private static final Pattern URL = Pattern.compile("^(jdbc:postgresql://[^/]+/)([^?]+)(\\?.*)?$");

    /** Coordenadas JDBC de um banco. */
    public record Coordinates(String url, String user, String password) {
        public Connection connect() throws SQLException {
            return DriverManager.getConnection(url, user, password);
        }
    }

    private static Coordinates shared;

    private PostgresTestDatabase() {
    }

    /** Banco compartilhado pela suíte (contexto Spring padrão do perfil test). */
    public static synchronized Coordinates shared() {
        if (shared == null) {
            shared = start();
        }
        return shared;
    }

    /** Banco novo e vazio no mesmo servidor, com nome {@code <prefixo>_<aleatório>}. */
    public static Coordinates create(String prefix) {
        Coordinates server = shared();
        String name = (prefix + "_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12)).toLowerCase(Locale.ROOT);
        if (!name.matches("[a-z][a-z0-9_]{0,62}")) {
            throw new IllegalArgumentException("Invalid test database name: " + name);
        }
        try (Connection connection = server.connect(); Statement statement = connection.createStatement()) {
            statement.execute("CREATE DATABASE " + name);
        } catch (SQLException exception) {
            throw new IllegalStateException("Could not create test database " + name, exception);
        }
        return new Coordinates(withDatabase(server.url(), name), server.user(), server.password());
    }

    /** Banco novo com todas as migrações do Flyway aplicadas; devolve as coordenadas e quantas migrações rodaram. */
    public static Coordinates migrated(String prefix) {
        Coordinates database = create(prefix);
        flyway(database).migrate();
        return database;
    }

    public static org.flywaydb.core.Flyway flyway(Coordinates database) {
        return org.flywaydb.core.Flyway.configure()
            .dataSource(database.url(), database.user(), database.password())
            .locations("classpath:db/migration")
            .load();
    }

    static String withDatabase(String url, String database) {
        Matcher matcher = URL.matcher(url);
        if (!matcher.matches()) {
            throw new IllegalArgumentException("Unsupported PostgreSQL JDBC URL: " + url);
        }
        return matcher.group(1) + database + (matcher.group(3) == null ? "" : matcher.group(3));
    }

    private static Coordinates start() {
        String url = System.getenv("TEST_DB_URL");
        if (url != null && !url.isBlank()) {
            return new Coordinates(url, System.getenv("TEST_DB_USER"), System.getenv("TEST_DB_PASSWORD"));
        }
        PostgreSQLContainer<?> container = new PostgreSQLContainer<>(DockerImageName.parse(IMAGE))
            .withDatabaseName("navitas_test")
            .withUsername("navitas_test")
            .withPassword("navitas_test")
            // Cada contexto Spring em cache mantém o próprio pool; folga para a suíte inteira.
            .withCommand("postgres", "-c", "max_connections=300", "-c", "fsync=off", "-c", "full_page_writes=off");
        container.start();
        Runtime.getRuntime().addShutdownHook(new Thread(container::stop, "postgres-test-container-stop"));
        return new Coordinates(container.getJdbcUrl(), container.getUsername(), container.getPassword());
    }
}
