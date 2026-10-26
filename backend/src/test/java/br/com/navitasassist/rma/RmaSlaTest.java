package br.com.navitasassist.rma;

import static org.junit.jupiter.api.Assertions.*;

import java.time.Instant;
import br.com.navitasassist.config.RmaSlaProperties;
import br.com.navitasassist.service.RmaSlaService;
import jakarta.validation.Validation;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;

class RmaSlaTest {
    private static final Instant START = Instant.parse("2026-01-01T10:00:00Z");
    private final RmaSlaProperties properties = new RmaSlaProperties();
    private final RmaSlaService service = new RmaSlaService(properties);

    @ParameterizedTest
    @CsvSource({"0,NORMAL", "479,NORMAL", "480,WARNING", "599,WARNING", "600,OVERDUE", "601,OVERDUE"})
    void shouldClassifyExactThresholds(long seconds, RmaSlaStatus status) {
        properties.getStages().get(RmaStatus.RECEIVED).setMinutes(10);
        RmaSlaResponse sla = calculate(record(), START.plusSeconds(seconds));
        assertEquals(status, sla.status());
        assertEquals(seconds, sla.elapsedSeconds());
        assertEquals(START.plusSeconds(600), sla.dueAt());
    }

    @Test
    void shouldIgnoreNotesAndUseOnlyMostRecentVisitToStage() {
        RmaRecord rma = record();
        rma.setStatus("TRIAGE");
        rma.addStatusHistory(event(2, RmaStatus.TRIAGE, 60));
        rma.addStatusHistory(event(5, RmaStatus.TRIAGE, 240));
        rma.addStatusHistory(event(3, RmaStatus.IN_DIAGNOSIS, 120));
        rma.addStatusHistory(event(4, RmaStatus.TRIAGE, 180));
        RmaSlaResponse sla = calculate(rma, START.plusSeconds(300));
        assertEquals(START.plusSeconds(180), sla.startedAt());
        assertEquals(120, sla.elapsedSeconds());
    }

    @Test
    void shouldOrderEqualTimestampsByHistoryId() {
        RmaRecord rma = record();
        rma.addStatusHistory(event(3, RmaStatus.RECEIVED, 60));
        rma.addStatusHistory(event(2, RmaStatus.TRIAGE, 60));
        assertEquals(START.plusSeconds(60), calculate(rma, START.plusSeconds(70)).startedAt());
    }

    @Test
    void shouldApplyPriorityOverrideWithoutChangingOtherPriorities() {
        properties.getStages().get(RmaStatus.RECEIVED).getPriorityMinutes().put(RmaPriority.HIGH, 5L);
        RmaRecord rma = record();
        rma.setPriority(RmaPriority.HIGH);
        assertEquals(300L, calculate(rma, START).limitSeconds());
        rma.setPriority(RmaPriority.MEDIUM);
        assertEquals(86400L, calculate(rma, START).limitSeconds());
    }

    @ParameterizedTest
    @EnumSource(value = RmaStatus.class, names = {"COMPLETED", "RETURNED", "IRREPARABLE"})
    void shouldStopTimeInClosedStagesAndRestartOnReopening(RmaStatus status) {
        RmaRecord rma = record();
        rma.setStatus(status.name());
        rma.addStatusHistory(event(2, status, 100));
        RmaSlaResponse closed = calculate(rma, START.plusSeconds(200));
        assertEquals(closed, calculate(rma, START.plusSeconds(900000)));
        assertEquals(RmaSlaStatus.CLOSED, closed.status());
        assertNull(closed.dueAt());
        assertEquals(0, closed.elapsedSeconds());
        rma.setStatus("RECEIVED");
        rma.addStatusHistory(event(3, RmaStatus.RECEIVED, 300));
        assertEquals(10, calculate(rma, START.plusSeconds(310)).elapsedSeconds());
    }

    @Test
    void shouldUseCreationForLegacyHistoryAndClampFutureTime() {
        RmaRecord rma = record();
        rma.getStatusHistory().clear();
        assertEquals(START, calculate(rma, START.plusSeconds(10)).startedAt());
        assertEquals(0, calculate(rma, START.minusSeconds(10)).elapsedSeconds());
    }

    @Test
    void shouldRejectInvalidConfiguration() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            assertTrue(validator.validate(properties).isEmpty());
            properties.setWarningPercent(100);
            assertFalse(validator.validate(properties).isEmpty());
            properties.setWarningPercent(80);
            properties.getStages().get(RmaStatus.RECEIVED).setMinutes(0);
            assertFalse(validator.validate(properties).isEmpty());
            properties.getStages().get(RmaStatus.RECEIVED).setMinutes(10);
            properties.getStages().get(RmaStatus.RECEIVED).getPriorityMinutes().put(RmaPriority.HIGH, -1L);
            assertFalse(validator.validate(properties).isEmpty());
            properties.getStages().remove(RmaStatus.TRIAGE);
            assertFalse(properties.isActiveStageCoverageValid());
        }
    }

    private RmaSlaResponse calculate(RmaRecord rma, Instant now) {
        boolean done = java.util.Set.of("COMPLETED", "RETURNED", "IRREPARABLE").contains(rma.getStatus());
        return service.calculate(rma, now, new br.com.navitasassist.workflow.WorkflowDocument.Status(rma.getStatus(), rma.getStatus(), done ? br.com.navitasassist.workflow.WorkflowDocument.Category.DONE : br.com.navitasassist.workflow.WorkflowDocument.Category.IN_PROGRESS, true, done ? null : RmaStatus.valueOf(rma.getStatus())));
    }

    private RmaRecord record() {
        RmaRecord rma = new RmaRecord();
        rma.setCreatedAt(START);
        rma.addStatusHistory(event(1, RmaStatus.RECEIVED, 0));
        return rma;
    }

    private RmaStatusHistory event(long id, RmaStatus status, long seconds) {
        RmaStatusHistory history = new RmaStatusHistory();
        history.setId(id);
        history.setStatus(status.name());
        history.setChangedAt(START.plusSeconds(seconds));
        return history;
    }
}
