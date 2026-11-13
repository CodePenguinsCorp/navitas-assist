package br.com.navitasassist.rma;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import br.com.navitasassist.service.RmaStageTimeService;
import org.junit.jupiter.api.Test;

class RmaStageTimeServiceTest {

    private static final Instant TEN = Instant.parse("2026-11-10T10:00:00Z");
    private final RmaStageTimeService service = new RmaStageTimeService();

    @Test
    void collapsesConsecutiveRecordsOfTheSameStage() {
        RmaRecord rma = rma(RmaStatus.TRIAGE);
        rma.addStatusHistory(event(1, RmaStatus.RECEIVED, 0));
        rma.addStatusHistory(event(2, RmaStatus.RECEIVED, 1800));
        rma.addStatusHistory(event(3, RmaStatus.TRIAGE, 7200));

        List<RmaStagePeriodResponse> periods = service.periods(rma, TEN.plusSeconds(10800));

        assertEquals(List.of(
            new RmaStagePeriodResponse(RmaStatus.RECEIVED, TEN, TEN.plusSeconds(7200), 7200),
            new RmaStagePeriodResponse(RmaStatus.TRIAGE, TEN.plusSeconds(7200), null, 3600)), periods);
    }

    @Test
    void reentryOpensANewPeriod() {
        RmaRecord rma = rma(RmaStatus.TRIAGE);
        rma.addStatusHistory(event(1, RmaStatus.TRIAGE, 0));
        rma.addStatusHistory(event(2, RmaStatus.IN_DIAGNOSIS, 100));
        rma.addStatusHistory(event(3, RmaStatus.TRIAGE, 300));

        List<RmaStagePeriodResponse> periods = service.periods(rma, TEN.plusSeconds(400));

        assertEquals(3, periods.size());
        assertEquals(List.of(RmaStatus.TRIAGE, RmaStatus.IN_DIAGNOSIS, RmaStatus.TRIAGE), periods.stream().map(RmaStagePeriodResponse::status).toList());
        assertEquals(TEN.plusSeconds(300), periods.get(2).enteredAt());
        assertEquals(100, periods.get(2).durationSeconds());
        assertEquals(200, periods.get(1).durationSeconds());
    }

    @Test
    void ordersEqualTimestampsById() {
        RmaRecord rma = rma(RmaStatus.TRIAGE);
        rma.addStatusHistory(event(2, RmaStatus.TRIAGE, 60));
        rma.addStatusHistory(event(1, RmaStatus.RECEIVED, 60));

        List<RmaStagePeriodResponse> periods = service.periods(rma, TEN.plusSeconds(70));

        assertEquals(RmaStatus.RECEIVED, periods.get(0).status());
        assertEquals(0, periods.get(0).durationSeconds());
        assertEquals(RmaStatus.TRIAGE, periods.get(1).status());
        assertEquals(10, periods.get(1).durationSeconds());
    }

    @Test
    void legacyWithoutHistoryStartsAtCreation() {
        RmaRecord rma = rma(RmaStatus.IN_REPAIR);
        rma.setCreatedAt(Instant.parse("2026-11-10T12:00:00Z"));

        assertEquals(List.of(new RmaStagePeriodResponse(RmaStatus.IN_REPAIR, Instant.parse("2026-11-10T12:00:00Z"), null, 3600)),
            service.periods(rma, Instant.parse("2026-11-10T13:00:00Z")));

        rma.setCreatedAt(null);
        rma.setEntryDate(LocalDate.parse("2026-11-10"));
        assertEquals(Instant.parse("2026-11-10T03:00:00Z"), service.periods(rma, Instant.parse("2026-11-10T13:00:00Z")).get(0).enteredAt());

        rma.setEntryDate(null);
        Instant now = Instant.parse("2026-11-10T13:00:00Z");
        assertEquals(new RmaStagePeriodResponse(RmaStatus.IN_REPAIR, now, null, 0), service.periods(rma, now).get(0));
    }

    @Test
    void appendsCurrentStageWhenHistoryIsBehind() {
        RmaRecord rma = rma(RmaStatus.IN_REPAIR);
        rma.addStatusHistory(event(1, RmaStatus.RECEIVED, 0));
        rma.addStatusHistory(event(2, RmaStatus.TRIAGE, 7200));

        List<RmaStagePeriodResponse> periods = service.periods(rma, TEN.plusSeconds(9000));

        assertEquals(3, periods.size());
        assertEquals(new RmaStagePeriodResponse(RmaStatus.TRIAGE, TEN.plusSeconds(7200), TEN.plusSeconds(7200), 0), periods.get(1));
        assertEquals(new RmaStagePeriodResponse(RmaStatus.IN_REPAIR, TEN.plusSeconds(7200), null, 1800), periods.get(2));
    }

    @Test
    void neverReturnsNegativeDurations() {
        RmaRecord rma = rma(RmaStatus.RECEIVED);
        rma.addStatusHistory(event(1, RmaStatus.RECEIVED, 600));

        RmaStagePeriodResponse current = service.periods(rma, TEN).get(0);

        assertEquals(0, current.durationSeconds());
        assertNull(current.leftAt());
    }

    @Test
    void closedRmaKeepsCountingSinceClosing() {
        RmaRecord rma = rma(RmaStatus.COMPLETED);
        rma.addStatusHistory(event(1, RmaStatus.IN_TESTS, -3600));
        rma.addStatusHistory(event(2, RmaStatus.COMPLETED, 0));

        List<RmaStagePeriodResponse> periods = service.periods(rma, TEN.plusSeconds(7200));

        assertEquals(new RmaStagePeriodResponse(RmaStatus.COMPLETED, TEN, null, 7200), periods.get(periods.size() - 1));
    }

    @Test
    void ignoresRecordsWithoutTimestamp() {
        RmaRecord rma = rma(RmaStatus.RECEIVED);
        rma.addStatusHistory(event(1, RmaStatus.RECEIVED, 0));
        RmaStatusHistory broken = event(2, RmaStatus.TRIAGE, 0);
        broken.setChangedAt(null);
        rma.addStatusHistory(broken);

        assertEquals(List.of(new RmaStagePeriodResponse(RmaStatus.RECEIVED, TEN, null, 60)), service.periods(rma, TEN.plusSeconds(60)));
    }

    private RmaRecord rma(RmaStatus status) {
        RmaRecord rma = new RmaRecord();
        rma.setStatus(status);
        rma.setCreatedAt(TEN.minusSeconds(86400));
        return rma;
    }

    private RmaStatusHistory event(long id, RmaStatus status, long seconds) {
        RmaStatusHistory history = new RmaStatusHistory();
        history.setId(id);
        history.setStatus(status);
        history.setChangedAt(TEN.plusSeconds(seconds));
        return history;
    }
}
