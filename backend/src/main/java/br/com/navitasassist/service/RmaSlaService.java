package br.com.navitasassist.service;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Comparator;

import br.com.navitasassist.config.RmaSlaProperties;
import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.rma.RmaSlaResponse;
import br.com.navitasassist.rma.RmaSlaStatus;
import br.com.navitasassist.rma.RmaStatus;
import br.com.navitasassist.rma.RmaStatusHistory;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class RmaSlaService {

    private final RmaSlaProperties properties;

    public RmaSlaResponse calculate(RmaRecord rma, Instant now) {
        Instant startedAt = stageEntry(rma, now);
        if (rma.getStatus() == RmaStatus.COMPLETED || rma.getStatus() == RmaStatus.RETURNED || rma.getStatus() == RmaStatus.IRREPARABLE) {
            return new RmaSlaResponse(RmaSlaStatus.CLOSED, startedAt, null, null, 0, null);
        }
        long limitSeconds = properties.getStages().get(rma.getStatus()).minutesFor(rma.getPriority()) * 60;
        Instant dueAt = startedAt.plusSeconds(limitSeconds);
        Instant warningAt = startedAt.plusSeconds(limitSeconds * properties.getWarningPercent() / 100);
        RmaSlaStatus status = !now.isBefore(dueAt) ? RmaSlaStatus.OVERDUE
            : !now.isBefore(warningAt) ? RmaSlaStatus.WARNING : RmaSlaStatus.NORMAL;
        return new RmaSlaResponse(status, startedAt, warningAt, dueAt,
            Math.max(0, Duration.between(startedAt, now).getSeconds()), limitSeconds);
    }

    private Instant stageEntry(RmaRecord rma, Instant now) {
        var history = rma.getStatusHistory().stream().filter(event -> event.getChangedAt() != null)
            .sorted(Comparator.comparing(RmaStatusHistory::getChangedAt)
                .thenComparing(RmaStatusHistory::getId, Comparator.nullsLast(Comparator.naturalOrder())).reversed()).toList();
        Instant entry = null;
        for (RmaStatusHistory event : history) {
            if (event.getStatus() != rma.getStatus()) {
                break;
            }
            // Consecutive notes in the same stage do not restart its SLA.
            entry = event.getChangedAt();
        }
        if (entry != null) {
            return entry;
        }
        if (rma.getCreatedAt() != null) {
            return rma.getCreatedAt();
        }
        return rma.getEntryDate() == null ? now : rma.getEntryDate().atStartOfDay(ZoneId.of("America/Sao_Paulo")).toInstant();
    }
}
