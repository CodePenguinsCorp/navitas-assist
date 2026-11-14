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
    private final NotificationEmailQuota quota;
    private long lastRealSendNanos;
    private boolean sentBefore;

    // Execução sequencial por instância; entre instâncias, prepare reserva cada tentativa com UPDATE condicional.
    @Scheduled(fixedDelayString = "${navitas.notifications.email.poll-ms:5000}", initialDelayString = "${navitas.notifications.email.poll-ms:5000}")
    public synchronized void poll() {
        if (!properties.getEmail().isEnabled()) return;
        var due = queue.due();
        if (due.isEmpty()) return;
        // Teto do plano: atingido, nada é preparado; as linhas seguem PENDING, sem gastar tentativas, até o próximo dia/mês.
        NotificationEmailQuota.Usage usage = quota.usage();
        long sentToday = usage.sentToday();
        long sentThisMonth = usage.sentThisMonth();
        for (Long id : due) {
            if (usage.reached(sentToday, sentThisMonth)) {
                log.info("result=EMAIL_LIMIT_REACHED sentToday={} sentThisMonth={}", sentToday, sentThisMonth);
                return;
            }
            NotificationEmailQueue.Delivery delivery = null;
            try {
                delivery = queue.prepare(id);
                if (delivery == null) continue;
                boolean real = NotificationEmailQuota.countsTowardQuota(delivery.provider());
                if (real) pace();
                EmailDeliveryException failure = null;
                try { provider.send(delivery.message(), delivery.idempotencyKey()); }
                catch (EmailDeliveryException error) { failure = error; }
                catch (RuntimeException error) { failure = new EmailDeliveryException("PROVIDER_ERROR", true); }
                if (real && failure == null) { sentToday++; sentThisMonth++; }
                queue.complete(delivery, failure);
                log.info("notificationId={} provider={} attempt={} result={}", id, delivery.provider(), delivery.attempt(), failure == null ? "SENT" : failure.code());
            } catch (RuntimeException error) {
                log.warn("notificationId={} result=PERSISTENCE_ERROR", id);
                try {
                    queue.recordProcessingError(id, delivery == null ? null : delivery.attempt());
                } catch (RuntimeException deferError) {
                    log.warn("notificationId={} result=DEFER_ERROR", id);
                }
            }
        }
    }

    /** Limite de taxa do provedor: espaça as requisições em pelo menos {@code send-interval-ms}; 429 segue retentável. */
    private void pace() {
        long intervalNanos = properties.getEmail().getSendIntervalMs() * 1_000_000L;
        if (sentBefore && intervalNanos > 0) {
            long waitNanos = lastRealSendNanos + intervalNanos - System.nanoTime();
            if (waitNanos > 0) {
                try {
                    Thread.sleep(waitNanos / 1_000_000L, (int) (waitNanos % 1_000_000L));
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException("Email worker interrupted");
                }
            }
        }
        lastRealSendNanos = System.nanoTime();
        sentBefore = true;
    }
}
