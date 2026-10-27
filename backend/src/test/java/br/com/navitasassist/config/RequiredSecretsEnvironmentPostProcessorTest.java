package br.com.navitasassist.config;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.SpringApplication;
import org.springframework.mock.env.MockEnvironment;

class RequiredSecretsEnvironmentPostProcessorTest {

    private final RequiredSecretsEnvironmentPostProcessor processor =
        new RequiredSecretsEnvironmentPostProcessor();
    private final SpringApplication application = new SpringApplication();

    @Test
    void shouldRejectNonLocalEnvironmentWhenSecretsAreMissing() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("prod");

        IllegalStateException exception = assertThrows(
            IllegalStateException.class,
            () -> processor.postProcessEnvironment(environment, application)
        );

        assertTrue(exception.getMessage().contains("DB_PASSWORD"));
        assertTrue(exception.getMessage().contains("APP_ADMIN_PASSWORD"));
    }

    @Test
    void shouldAcceptNonLocalEnvironmentWhenAllSecretsArePresent() {
        MockEnvironment environment = environmentWithSecrets();
        environment.setActiveProfiles("prod");

        assertDoesNotThrow(() -> processor.postProcessEnvironment(environment, application));
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
    @CsvSource({
        "DB_PASSWORD, admin123", "DB_PASSWORD, navitas123", "DB_PASSWORD, root123",
        "DB_PASSWORD, troque-esta-senha", "DB_PASSWORD, troque-esta-senha-root",
        "APP_ADMIN_PASSWORD, admin123", "APP_ADMIN_PASSWORD, navitas123", "APP_ADMIN_PASSWORD, root123",
        "APP_ADMIN_PASSWORD, troque-esta-senha", "APP_ADMIN_PASSWORD, troque-esta-senha-root"
    })
    void shouldRejectPublishedPasswordsWithoutExposingTheirValues(String variable, String password) {
        MockEnvironment environment = environmentWithSecrets();
        environment.setActiveProfiles("prod");
        environment.setProperty(variable, password);

        IllegalStateException error = assertThrows(IllegalStateException.class,
            () -> processor.postProcessEnvironment(environment, application));

        assertEquals("Replace example passwords for a non-local environment: " + variable, error.getMessage());
        assertFalse(error.getMessage().contains(password));
        assertFalse(error.getMessage().contains("database-secret"));
        assertFalse(error.getMessage().contains("application-secret"));
        assertFalse(error.getMessage().contains(environment.getProperty("DB_URL")));
        assertEquals(password, environment.getProperty(variable));
    }

    @Test
    void shouldReportBothUnsafeVariablesWithoutTheirPasswords() {
        MockEnvironment environment = environmentWithSecrets();
        environment.setActiveProfiles("prod");
        environment.setProperty("DB_PASSWORD", "navitas123");
        environment.setProperty("APP_ADMIN_PASSWORD", "admin123");

        IllegalStateException error = assertThrows(IllegalStateException.class,
            () -> processor.postProcessEnvironment(environment, application));

        assertEquals("Replace example passwords for a non-local environment: DB_PASSWORD, APP_ADMIN_PASSWORD", error.getMessage());
        assertFalse(error.getMessage().contains("navitas123"));
        assertFalse(error.getMessage().contains("admin123"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "qa"})
    void shouldRejectExamplesWithoutAnExplicitProductionProfile(String profile) {
        MockEnvironment environment = environmentWithSecrets();
        if (!profile.isEmpty()) {
            environment.setActiveProfiles(profile);
        }
        environment.setProperty("APP_ADMIN_PASSWORD", "admin123");
        assertThrows(IllegalStateException.class, () -> processor.postProcessEnvironment(environment, application));
    }

    @ParameterizedTest
    @ValueSource(strings = {"local", "test"})
    void shouldKeepPublishedPasswordsAvailableForLocalDefaults(String profile) {
        MockEnvironment environment = environmentWithSecrets();
        environment.setActiveProfiles(profile);
        environment.setProperty("DB_PASSWORD", "navitas123");
        environment.setProperty("APP_ADMIN_PASSWORD", "admin123");
        assertDoesNotThrow(() -> processor.postProcessEnvironment(environment, application));
    }

    @Test
    void shouldKeepSpringBootTestBootstrapBypassForExamplePasswords() {
        MockEnvironment environment = environmentWithSecrets();
        environment.setProperty("org.springframework.boot.test.context.SpringBootTestContextBootstrapper", "true");
        environment.setProperty("APP_ADMIN_PASSWORD", "admin123");
        assertDoesNotThrow(() -> processor.postProcessEnvironment(environment, application));
    }

    @Test
    void shouldAcceptAdminUsernameAndPreserveCustomSecretValues() {
        MockEnvironment environment = environmentWithSecrets();
        environment.setActiveProfiles("prod");
        environment.setProperty("APP_ADMIN_USERNAME", "admin");
        environment.setProperty("APP_ADMIN_PASSWORD", " custom-application-secret ");
        environment.setProperty("DB_PASSWORD", " custom-database-secret ");
        assertDoesNotThrow(() -> processor.postProcessEnvironment(environment, application));
        assertEquals(" custom-application-secret ", environment.getProperty("APP_ADMIN_PASSWORD"));
        assertEquals(" custom-database-secret ", environment.getProperty("DB_PASSWORD"));
    }

    @Test
    void shouldPreserveMissingVariableDiagnosticPrecedence() {
        MockEnvironment environment = environmentWithSecrets();
        environment.setActiveProfiles("prod");
        environment.setProperty("DB_USER", "");
        environment.setProperty("APP_ADMIN_PASSWORD", "admin123");
        IllegalStateException error = assertThrows(IllegalStateException.class,
            () -> processor.postProcessEnvironment(environment, application));
        assertEquals("Missing required environment variables for a non-local environment: DB_USER", error.getMessage());
    }

    private MockEnvironment environmentWithSecrets() {
        MockEnvironment environment = new MockEnvironment();
        Map.of(
            "DB_URL", "jdbc:mysql://db/navitas",
            "DB_USER", "navitas",
            "DB_PASSWORD", "database-secret",
            "APP_ADMIN_USERNAME", "administrator",
            "APP_ADMIN_PASSWORD", "application-secret",
            "APP_ADMIN_FULL_NAME", "Administrator"
        ).forEach(environment::setProperty);
        return environment;
    }
}
