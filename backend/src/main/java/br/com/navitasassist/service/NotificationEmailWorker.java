package br.com.navitasassist.service;

import br.com.navitasassist.config.NotificationProperties;
import br.com.navitasassist.notification.email.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class NotificationEmailWorker {
    private final NotificationEmailQueue queue;
    private final EmailProvider provider;
    private final NotificationProperties properties;

    // Execução sequencial por instância; entre instâncias, prepare reserva cada tentativa com UPDATE condicional.
    @Scheduled(fixedDelayString = "${navitas.notifications.email.poll-ms:5000}", initialDelayString = "${navitas.notifications.email.poll-ms:5000}")
    public synchronized void poll() {
        if (!properties.getEmail().isEnabled()) return;
        for (Long id : queue.due()) {
            try {
                var delivery = queue.prepare(id);
                if (delivery == null) continue;
                EmailDeliveryException failure = null;
                try { provider.send(delivery.message(), id.toString()); }
                catch (EmailDeliveryException error) { failure = error; }
                catch (RuntimeException error) { failure = new EmailDeliveryException("PROVIDER_ERROR", true); }
                queue.complete(delivery, failure);
                log.info("notificationId={} provider={} attempt={} result={}", id, delivery.provider(), delivery.attempt(), failure == null ? "SENT" : failure.code());
            } catch (RuntimeException error) {
                log.warn("notificationId={} result=PERSISTENCE_ERROR", id);
            }
        }
    }
}
