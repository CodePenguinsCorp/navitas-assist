package br.com.navitasassist.config;

import java.time.Instant;

import br.com.navitasassist.service.ShipmentService;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

@Configuration
@EnableScheduling
@RequiredArgsConstructor
public class ShipmentRetentionJob {

    private final ShipmentService shipmentService;

    @Scheduled(cron = "${navitas.shipments.retention-cron:0 0 3 * * *}", zone = "America/Sao_Paulo")
    public void purgeExpiredAddresses() {
        shipmentService.purgeExpiredAddresses(Instant.now());
    }
}
