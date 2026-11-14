package br.com.navitasassist.service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.EnumSet;
import java.util.Set;

import br.com.navitasassist.config.RmaDeadlineProperties;
import br.com.navitasassist.rma.RmaDeadlineResponse;
import br.com.navitasassist.rma.RmaDeadlineStatus;
import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.rma.RmaStatus;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/** Situation of the RMA due date against "today" in the business time zone. Closed RMAs are never overdue. */
@Service
@RequiredArgsConstructor
public class RmaDeadlineService {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Sao_Paulo");
    private static final Set<RmaStatus> CLOSED_STATUSES = EnumSet.of(RmaStatus.COMPLETED, RmaStatus.RETURNED, RmaStatus.IRREPARABLE);

    private final RmaDeadlineProperties properties;

    public static LocalDate businessDate(Instant now) {
        return LocalDate.ofInstant(now, BUSINESS_ZONE);
    }

    public RmaDeadlineResponse evaluate(RmaRecord rma, LocalDate today) {
        LocalDate dueDate = rma.getDueDate();
        LocalDate dueSoonFrom = dueDate == null ? null : dueDate.minusDays(properties.getWarningDays());
        if (CLOSED_STATUSES.contains(rma.getStatus())) {
            return new RmaDeadlineResponse(RmaDeadlineStatus.CLOSED, dueSoonFrom);
        }
        if (dueDate == null) {
            return new RmaDeadlineResponse(RmaDeadlineStatus.NO_DUE_DATE, null);
        }
        RmaDeadlineStatus status = today.isAfter(dueDate) ? RmaDeadlineStatus.OVERDUE
            : today.isBefore(dueSoonFrom) ? RmaDeadlineStatus.ON_TRACK : RmaDeadlineStatus.DUE_SOON;
        return new RmaDeadlineResponse(status, dueSoonFrom);
    }
}
