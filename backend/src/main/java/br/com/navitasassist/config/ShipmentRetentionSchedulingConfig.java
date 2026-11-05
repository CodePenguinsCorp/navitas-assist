package br.com.navitasassist.config;

import java.time.Instant;
import java.time.ZoneId;

import br.com.navitasassist.service.ShipmentService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.scheduling.support.CronTrigger;

/**
 * Schedules the shipment address retention with its own scheduler instead of {@code @EnableScheduling}, so turning it on
 * does not activate other {@code @Scheduled} jobs that are controlled by their own flags.
 */
@Configuration
@ConditionalOnProperty(prefix = "navitas.shipments.retention", name = "enabled", havingValue = "true", matchIfMissing = true)
public class ShipmentRetentionSchedulingConfig {

    @Bean(destroyMethod = "shutdown")
    public ShipmentRetentionJob shipmentRetentionJob(ShipmentService shipmentService, @Value("${navitas.shipments.retention.cron:0 0 3 * * *}") String cron) {
        return new ShipmentRetentionJob(shipmentService, cron);
    }

    public static class ShipmentRetentionJob {

        private final ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();

        ShipmentRetentionJob(ShipmentService shipmentService, String cron) {
            scheduler.setPoolSize(1);
            scheduler.setThreadNamePrefix("shipment-retention-");
            scheduler.initialize();
            scheduler.schedule(() -> shipmentService.purgeExpiredAddresses(Instant.now()), new CronTrigger(cron, ZoneId.of("America/Sao_Paulo")));
        }

        public void shutdown() {
            scheduler.shutdown();
        }
    }
}
