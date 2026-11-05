package br.com.navitasassist.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.after;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;

import java.time.Instant;

import br.com.navitasassist.service.SlaNotificationScanner;
import br.com.navitasassist.service.SlaNotificationScheduler;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.config.ScheduledTaskHolder;

/**
 * Scheduling may be enabled by any part of the application; the SLA flag alone must decide whether the scan runs.
 */
class SlaNotificationSchedulerTest {

    private final SlaNotificationScanner scanner = mock(SlaNotificationScanner.class);

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
        .withUserConfiguration(SchedulingEnabledElsewhere.class, SlaNotificationScheduler.class)
        .withBean(SlaNotificationScanner.class, () -> scanner)
        .withPropertyValues("navitas.notifications.sla-scan.interval=PT0.05S");

    @Test
    void flagOffKeepsTheScanOffEvenWithSchedulingEnabled() {
        contextRunner.withPropertyValues("navitas.notifications.sla-scan.enabled=false").run(context -> {
            assertThat(context).doesNotHaveBean(SlaNotificationScheduler.class);
            assertThat(context.getBean(ScheduledTaskHolder.class).getScheduledTasks()).isEmpty();
            verify(scanner, after(300).never()).scan(any(Instant.class));
        });
    }

    @Test
    void flagOnSchedulesTheScan() {
        contextRunner.withPropertyValues("navitas.notifications.sla-scan.enabled=true").run(context -> {
            assertThat(context).hasSingleBean(SlaNotificationScheduler.class);
            assertThat(context.getBean(ScheduledTaskHolder.class).getScheduledTasks()).hasSize(1);
            verify(scanner, timeout(2000).atLeastOnce()).scan(any(Instant.class));
        });
    }

    @Configuration(proxyBeanMethods = false)
    @EnableScheduling
    static class SchedulingEnabledElsewhere {
    }
}
