package br.com.navitasassist.service;

import java.time.Instant;

import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Periodic trigger of the SLA scan. Registered only when {@code navitas.notifications.sla-scan.enabled} is true, so the
 * flag turns the scan off even if another part of the application enables scheduling.
 */
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "navitas.notifications.sla-scan", name = "enabled", havingValue = "true", matchIfMissing = true)
public class SlaNotificationScheduler {

    private final SlaNotificationScanner slaNotificationScanner;

    @Scheduled(fixedDelayString = "${navitas.notifications.sla-scan.interval:PT5M}", initialDelayString = "${navitas.notifications.sla-scan.interval:PT5M}")
    public void scheduledScan() {
        slaNotificationScanner.scan(Instant.now());
    }
}
