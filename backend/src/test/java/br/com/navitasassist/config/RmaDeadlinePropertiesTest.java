package br.com.navitasassist.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

class RmaDeadlinePropertiesTest {
    private final ApplicationContextRunner runner = new ApplicationContextRunner().withUserConfiguration(DeadlineConfiguration.class);

    @Test
    void defaultsToSevenDays() {
        runner.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(RmaDeadlineProperties.class).getWarningDays()).isEqualTo(7);
        });
    }

    @Test
    void acceptsZeroWindow() {
        runner.withPropertyValues("navitas.deadline.warning-days=0").run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(RmaDeadlineProperties.class).getWarningDays()).isZero();
        });
    }

    @Test
    void rejectsWindowOutOfRangeOnStartup() {
        runner.withPropertyValues("navitas.deadline.warning-days=-1").run(context -> assertThat(context).hasFailed());
        runner.withPropertyValues("navitas.deadline.warning-days=91").run(context -> assertThat(context).hasFailed());
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(RmaDeadlineProperties.class)
    static class DeadlineConfiguration {}
}
