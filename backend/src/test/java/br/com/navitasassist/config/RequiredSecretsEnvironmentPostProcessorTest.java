package br.com.navitasassist.config;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.mock.env.MockEnvironment;

class RequiredSecretsEnvironmentPostProcessorTest {

    private final RequiredSecretsEnvironmentPostProcessor processor =
        new RequiredSecretsEnvironmentPostProcessor();
    private final SpringApplication application = new SpringApplication();

    @Test
    void shouldAcceptDatabaseSecretsWithoutAdministratorSettings() {
        MockEnvironment environment = new MockEnvironment()
            .withProperty("DB_URL", "jdbc:postgresql://db/navitas")
            .withProperty("DB_USER", "navitas")
            .withProperty("DB_PASSWORD", "database-secret");
        environment.setActiveProfiles("prod");

        assertDoesNotThrow(() -> processor.postProcessEnvironment(environment, application));
    }

    @Test
    void shouldStartAfterActivatingTheLocalProfile() {
        SpringApplication startup = new SpringApplication(StartupConfiguration.class);
        startup.setWebApplicationType(WebApplicationType.NONE);
        try (ConfigurableApplicationContext context = startup.run("--spring.profiles.active=local")) {
            assertTrue(context.getEnvironment().matchesProfiles("local"));
        }
    }

    @Test
    void shouldRejectNonLocalEnvironmentWhenSecretsAreMissing() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("prod");

        IllegalStateException exception = assertThrows(
            IllegalStateException.class,
            () -> processor.postProcessEnvironment(environment, application)
        );

        assertTrue(exception.getMessage().contains("DB_PASSWORD"));
    }

    @Test
    void shouldAllowDefaultsOnlyForLocalAndTestProfiles() {
        for (String profile : new String[] {"local", "test"}) {
            MockEnvironment environment = new MockEnvironment();
            environment.setActiveProfiles(profile);

            assertDoesNotThrow(() -> processor.postProcessEnvironment(environment, application));
        }
    }

    @Test
    void shouldAllowSpringBootTestBootstrapBeforeItsProfileIsActivated() {
        MockEnvironment environment = new MockEnvironment()
            .withProperty(
                "org.springframework.boot.test.context.SpringBootTestContextBootstrapper",
                "true"
            );

        assertDoesNotThrow(() -> processor.postProcessEnvironment(environment, application));
    }

    @ParameterizedTest
    @ValueSource(strings = {"admin123", "navitas123", "root123", "troque-esta-senha", "troque-esta-senha-root"})
    void shouldRejectPublishedPasswordsWithoutExposingTheirValues(String password) {
        MockEnvironment environment = environmentWithSecrets();
        environment.setActiveProfiles("prod");
        environment.setProperty("DB_PASSWORD", password);

        IllegalStateException error = assertThrows(IllegalStateException.class,
            () -> processor.postProcessEnvironment(environment, application));

        assertEquals("Replace example passwords for a non-local environment: DB_PASSWORD", error.getMessage());
        assertFalse(error.getMessage().contains(password));
        assertFalse(error.getMessage().contains("database-secret"));
        assertFalse(error.getMessage().contains(environment.getProperty("DB_URL")));
        assertEquals(password, environment.getProperty("DB_PASSWORD"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "qa"})
    void shouldRejectExamplesWithoutAnExplicitProductionProfile(String profile) {
        MockEnvironment environment = environmentWithSecrets();
        if (!profile.isEmpty()) {
            environment.setActiveProfiles(profile);
        }
        environment.setProperty("DB_PASSWORD", "navitas123");
        assertThrows(IllegalStateException.class, () -> processor.postProcessEnvironment(environment, application));
    }

    @ParameterizedTest
    @ValueSource(strings = {"local", "test"})
    void shouldKeepPublishedPasswordsAvailableForLocalDefaults(String profile) {
        MockEnvironment environment = environmentWithSecrets();
        environment.setActiveProfiles(profile);
        environment.setProperty("DB_PASSWORD", "navitas123");
        assertDoesNotThrow(() -> processor.postProcessEnvironment(environment, application));
    }

    @Test
    void shouldKeepSpringBootTestBootstrapBypassForExamplePasswords() {
        MockEnvironment environment = environmentWithSecrets();
        environment.setProperty("org.springframework.boot.test.context.SpringBootTestContextBootstrapper", "true");
        environment.setProperty("DB_PASSWORD", "navitas123");
        assertDoesNotThrow(() -> processor.postProcessEnvironment(environment, application));
    }

    @Test
    void shouldPreserveCustomDatabasePassword() {
        MockEnvironment environment = environmentWithSecrets();
        environment.setActiveProfiles("prod");
        environment.setProperty("DB_PASSWORD", " custom-database-secret ");
        assertDoesNotThrow(() -> processor.postProcessEnvironment(environment, application));
        assertEquals(" custom-database-secret ", environment.getProperty("DB_PASSWORD"));
    }

    @Test
    void shouldPreserveMissingVariableDiagnosticPrecedence() {
        MockEnvironment environment = environmentWithSecrets();
        environment.setActiveProfiles("prod");
        environment.setProperty("DB_USER", "");
        environment.setProperty("DB_PASSWORD", "navitas123");
        IllegalStateException error = assertThrows(IllegalStateException.class,
            () -> processor.postProcessEnvironment(environment, application));
        assertEquals("Missing required environment variables for a non-local environment: DB_USER", error.getMessage());
    }

    private MockEnvironment environmentWithSecrets() {
        MockEnvironment environment = new MockEnvironment();
        Map.of(
            "DB_URL", "jdbc:postgresql://db/navitas",
            "DB_USER", "navitas",
            "DB_PASSWORD", "database-secret"
        ).forEach(environment::setProperty);
        return environment;
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class StartupConfiguration {
    }
}
