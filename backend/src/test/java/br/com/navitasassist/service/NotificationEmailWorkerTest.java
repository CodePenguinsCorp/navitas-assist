package br.com.navitasassist.service;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import br.com.navitasassist.config.NotificationProperties;
import br.com.navitasassist.notification.email.EmailMessage;
import br.com.navitasassist.notification.email.EmailProvider;
import br.com.navitasassist.notification.email.EmailSendResult;
import org.junit.jupiter.api.Test;

class NotificationEmailWorkerTest {
    private final NotificationEmailQueue queue = mock(NotificationEmailQueue.class);
    private final EmailProvider provider = mock(EmailProvider.class);
    private final NotificationEmailQuota quota = mock(NotificationEmailQuota.class);
    private final NotificationProperties properties = new NotificationProperties();
    private final EmailMessage message = new EmailMessage("from@example.invalid", "to@example.invalid", "Assunto", "Texto", "<p>Texto</p>");

    private NotificationEmailWorker worker(String providerName, long intervalMs, NotificationEmailQuota.Usage usage) {
        properties.getEmail().setEnabled(true);
        properties.getEmail().setProvider(providerName);
        properties.getEmail().setSendIntervalMs(intervalMs);
        when(quota.usage()).thenReturn(usage);
        when(queue.due()).thenReturn(List.of(1L, 2L, 3L));
        for (long id = 1; id <= 3; id++) {
            when(queue.prepare(id)).thenReturn(new NotificationEmailQueue.Delivery(id, 1, providerName, message, String.valueOf(id)));
        }
        when(provider.send(any(), any())).thenReturn(new EmailSendResult("accepted"));
        return new NotificationEmailWorker(queue, provider, properties, quota);
    }

    @Test
    void spacesRealProviderSendsToRespectTheRateLimit() {
        NotificationEmailWorker worker = worker("resend", 200, new NotificationEmailQuota.Usage(0, 100, 0, 3000));
        long start = System.nanoTime();
        worker.poll();
        long elapsedMs = (System.nanoTime() - start) / 1_000_000;
        verify(provider, times(3)).send(any(), any());
        assertTrue(elapsedMs >= 400, "três envios com 200 ms de intervalo levaram " + elapsedMs + " ms");
    }

    @Test
    void stopsBeforePreparingOnceTheCapIsReachedDuringThePoll() {
        NotificationEmailWorker worker = worker("resend", 0, new NotificationEmailQuota.Usage(98, 100, 98, 3000));
        worker.poll();
        verify(provider, times(2)).send(any(), any());
        verify(queue, never()).prepare(3L);
    }

    @Test
    void doesNotPrepareAnythingWhenTheCapIsAlreadyReached() {
        NotificationEmailWorker worker = worker("resend", 0, new NotificationEmailQuota.Usage(10, 100, 3000, 3000));
        worker.poll();
        verify(queue, never()).prepare(anyLong());
        verify(provider, never()).send(any(), any());
    }
}
