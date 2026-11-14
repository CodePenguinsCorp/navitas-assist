package br.com.navitasassist.service;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

import br.com.navitasassist.config.NotificationProperties;
import br.com.navitasassist.repository.NotificationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Teto de envios do plano do provedor: conta as entregas SENT do provedor real no dia e no mês civis de São Paulo.
 * O teto é suave entre instâncias (cada uma conta antes de enviar) e não consome tentativas: o worker apenas para.
 */
@Service
@RequiredArgsConstructor
public class NotificationEmailQuota {
    static final ZoneId ZONE = ZoneId.of("America/Sao_Paulo");

    private final NotificationRepository notifications;
    private final NotificationProperties properties;
    private final Clock clock;

    public record Usage(long sentToday, int dailyLimit, long sentThisMonth, int monthlyLimit) {
        public boolean limitReached() {
            return reached(sentToday, sentThisMonth);
        }

        public boolean reached(long today, long thisMonth) {
            return (dailyLimit > 0 && today >= dailyLimit) || (monthlyLimit > 0 && thisMonth >= monthlyLimit);
        }
    }

    @Transactional(readOnly = true)
    public Usage usage() {
        LocalDate today = clock.instant().atZone(ZONE).toLocalDate();
        LocalDate month = today.withDayOfMonth(1);
        var email = properties.getEmail();
        return new Usage(
            notifications.countRealEmailsSentBetween(start(today), start(today.plusDays(1))), email.getDailyLimit(),
            notifications.countRealEmailsSentBetween(start(month), start(month.plusMonths(1))), email.getMonthlyLimit());
    }

    /** O fake simula a entrega e não consome a cota do provedor. */
    static boolean countsTowardQuota(String provider) {
        return provider != null && !"fake".equals(provider);
    }

    private static Instant start(LocalDate day) {
        return day.atStartOfDay(ZONE).toInstant();
    }
}
