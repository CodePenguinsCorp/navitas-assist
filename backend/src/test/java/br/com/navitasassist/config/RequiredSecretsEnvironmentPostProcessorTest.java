package br.com.navitasassist.config;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;
import org.junit.jupiter.api.Test;
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
