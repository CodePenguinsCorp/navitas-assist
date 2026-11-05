package br.com.navitasassist.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import br.com.navitasassist.service.ShipmentService;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.scheduling.annotation.ScheduledAnnotationBeanPostProcessor;

class ShipmentRetentionSchedulingConfigTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
        .withBean(ShipmentService.class, () -> mock(ShipmentService.class))
        .withUserConfiguration(ShipmentRetentionSchedulingConfig.class);

    @Test
    void shouldScheduleRetentionByDefaultWithoutEnablingGlobalScheduling() {
        contextRunner.run(context -> {
            assertThat(context).hasSingleBean(ShipmentRetentionSchedulingConfig.ShipmentRetentionJob.class);
            assertThat(context).doesNotHaveBean(ScheduledAnnotationBeanPostProcessor.class);
        });
    }

    @Test
    void shouldNotScheduleRetentionWhenDisabled() {
        contextRunner.withPropertyValues("navitas.shipments.retention.enabled=false")
            .run(context -> assertThat(context).doesNotHaveBean(ShipmentRetentionSchedulingConfig.ShipmentRetentionJob.class));
    }
}
