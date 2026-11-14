package br.com.navitasassist.support;

import java.util.Map;

import org.springframework.context.ApplicationContextInitializer;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

/**
 * Aponta todo contexto Spring dos testes para o PostgreSQL de {@link PostgresTestDatabase}, sem anotação em cada classe
 * (registrado em {@code src/test/resources/META-INF/spring.factories}).
 *
 * <p>Por padrão usa o banco compartilhado. Uma classe que precisa de banco só seu declara
 * {@code @SpringBootTest(properties = "navitas.test.database=<prefixo>")} e recebe um banco novo e vazio.
 */
public class PostgresContextInitializer implements ApplicationContextInitializer<ConfigurableApplicationContext> {

    static final String OWN_DATABASE = "navitas.test.database";

    @Override
    public void initialize(ConfigurableApplicationContext context) {
        ConfigurableEnvironment environment = context.getEnvironment();
        String ownDatabase = environment.getProperty(OWN_DATABASE);
        PostgresTestDatabase.Coordinates database = ownDatabase == null || ownDatabase.isBlank()
            ? PostgresTestDatabase.shared()
            : PostgresTestDatabase.create(ownDatabase);
        environment.getPropertySources().addFirst(new MapPropertySource("navitasPostgresTestDatabase", Map.of(
            "spring.datasource.url", database.url(),
            "spring.datasource.username", database.user(),
            "spring.datasource.password", database.password() == null ? "" : database.password()
        )));
    }
}
