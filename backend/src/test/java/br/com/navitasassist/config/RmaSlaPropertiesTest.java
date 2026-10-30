package br.com.navitasassist.config;

import static org.assertj.core.api.Assertions.assertThat;

import br.com.navitasassist.rma.RmaPriority;
import br.com.navitasassist.rma.RmaStatus;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

class RmaSlaPropertiesTest {
    private final ApplicationContextRunner runner = new ApplicationContextRunner().withUserConfiguration(SlaConfiguration.class);

    @Test
    void shouldBindStageAndPriorityOverridesAndKeepOtherDefaults() {
        runner.withPropertyValues("navitas.sla.warning-percent=70", "navitas.sla.stages.IN_DIAGNOSIS.minutes=120",
            "navitas.sla.stages.IN_DIAGNOSIS.priority-minutes.HIGH=30").run(context -> {
                assertThat(context).hasNotFailed();
                RmaSlaProperties properties = context.getBean(RmaSlaProperties.class);
                assertThat(properties.getWarningPercent()).isEqualTo(70);
                assertThat(properties.getStages().get(RmaStatus.IN_DIAGNOSIS).minutesFor(RmaPriority.HIGH)).isEqualTo(30);
                assertThat(properties.getStages().get(RmaStatus.IN_DIAGNOSIS).minutesFor(RmaPriority.LOW)).isEqualTo(120);
                assertThat(properties.getStages().get(RmaStatus.WAITING_PART).getMinutes()).isEqualTo(7200);
            });
    }

    @Test
    void shouldRejectInvalidThresholdOnStartup() {
        runner.withPropertyValues("navitas.sla.warning-percent=100").run(context -> assertThat(context).hasFailed());
    }

    @Test
    void shouldRejectInvalidPriorityDurationOnStartup() {
        runner.withPropertyValues("navitas.sla.stages.TRIAGE.priority-minutes.HIGH=0").run(context -> assertThat(context).hasFailed());
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(RmaSlaProperties.class)
    static class SlaConfiguration {}
}
