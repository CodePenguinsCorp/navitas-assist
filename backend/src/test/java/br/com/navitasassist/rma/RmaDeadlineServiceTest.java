package br.com.navitasassist.rma;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.time.Instant;
import java.time.LocalDate;

import br.com.navitasassist.config.RmaDeadlineProperties;
import br.com.navitasassist.service.RmaDeadlineService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;

class RmaDeadlineServiceTest {

    private static final LocalDate TODAY = LocalDate.parse("2026-11-13");
    private final RmaDeadlineProperties properties = new RmaDeadlineProperties();
    private final RmaDeadlineService service = new RmaDeadlineService(properties);

    @ParameterizedTest
    @CsvSource({"2026-11-21,ON_TRACK", "2026-11-20,DUE_SOON", "2026-11-13,DUE_SOON", "2026-11-12,OVERDUE"})
    void classifiesBoundaries(LocalDate dueDate, RmaDeadlineStatus status) {
        RmaDeadlineResponse deadline = service.evaluate(rma(RmaStatus.IN_REPAIR, dueDate), TODAY);

        assertEquals(status, deadline.status());
        assertEquals(dueDate.minusDays(7), deadline.dueSoonFrom());
    }

    @Test
    void zeroWindowOnlyFlagsTheDueDay() {
        properties.setWarningDays(0);

        assertEquals(RmaDeadlineStatus.ON_TRACK, service.evaluate(rma(RmaStatus.TRIAGE, TODAY.plusDays(1)), TODAY).status());
        assertEquals(RmaDeadlineStatus.DUE_SOON, service.evaluate(rma(RmaStatus.TRIAGE, TODAY), TODAY).status());
    }

    @ParameterizedTest
    @EnumSource(value = RmaStatus.class, names = {"COMPLETED", "RETURNED", "IRREPARABLE"})
    void closedIsNeverOverdue(RmaStatus status) {
        RmaDeadlineResponse deadline = service.evaluate(rma(status, TODAY.minusDays(30)), TODAY);

        assertEquals(RmaDeadlineStatus.CLOSED, deadline.status());
        assertEquals(TODAY.minusDays(37), deadline.dueSoonFrom());
    }

    @Test
    void withoutDueDate() {
        RmaDeadlineResponse open = service.evaluate(rma(RmaStatus.RECEIVED, null), TODAY);
        assertEquals(new RmaDeadlineResponse(RmaDeadlineStatus.NO_DUE_DATE, null), open);

        assertEquals(new RmaDeadlineResponse(RmaDeadlineStatus.CLOSED, null), service.evaluate(rma(RmaStatus.COMPLETED, null), TODAY));
    }

    @Test
    void businessDateUsesSaoPauloMidnight() {
        assertEquals(LocalDate.parse("2026-11-13"), RmaDeadlineService.businessDate(Instant.parse("2026-11-14T02:59:59Z")));
        assertEquals(LocalDate.parse("2026-11-14"), RmaDeadlineService.businessDate(Instant.parse("2026-11-14T03:00:00Z")));
    }

    private RmaRecord rma(RmaStatus status, LocalDate dueDate) {
        RmaRecord rma = new RmaRecord();
        rma.setStatus(status);
        rma.setDueDate(dueDate);
        return rma;
    }
}
