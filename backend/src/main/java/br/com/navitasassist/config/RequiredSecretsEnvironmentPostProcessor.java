package br.com.navitasassist.config;

import java.util.Arrays;
import java.util.List;
import java.util.Set;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.util.StringUtils;

public class RequiredSecretsEnvironmentPostProcessor implements EnvironmentPostProcessor, Ordered {

    private static final String SPRING_BOOT_TEST_BOOTSTRAPPER =
        "org.springframework.boot.test.context.SpringBootTestContextBootstrapper";
    private static final Set<String> PROFILES_WITH_LOCAL_DEFAULTS = Set.of("local", "test");
    private static final List<String> REQUIRED_VARIABLES = List.of(
        "DB_URL",
        "DB_USER",
        "DB_PASSWORD",
        "APP_ADMIN_USERNAME",
        "APP_ADMIN_PASSWORD",
        "APP_ADMIN_FULL_NAME"
    );

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        if (environment.getProperty(SPRING_BOOT_TEST_BOOTSTRAPPER, Boolean.class, false)) {
            return;
        }

        boolean localDefaultsAllowed = Arrays.stream(environment.getActiveProfiles())
            .anyMatch(PROFILES_WITH_LOCAL_DEFAULTS::contains);
        if (localDefaultsAllowed) {
            return;
        }

        List<String> missingVariables = REQUIRED_VARIABLES.stream()
            .filter(variable -> !StringUtils.hasText(environment.getProperty(variable)))
            .toList();
        if (!missingVariables.isEmpty()) {
            throw new IllegalStateException(
                "Missing required environment variables for a non-local environment: "
                    + String.join(", ", missingVariables)
            );
        }
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE;
    }
}
