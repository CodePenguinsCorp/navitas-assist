package br.com.navitasassist.rma;

import java.time.Instant;
import java.time.LocalDate;

public record RmaDueDateHistoryResponse(LocalDate previousDueDate, LocalDate newDueDate, String changedBy, Instant changedAt) {

    public static RmaDueDateHistoryResponse from(RmaDueDateHistory history) {
        return new RmaDueDateHistoryResponse(history.getPreviousDueDate(), history.getNewDueDate(), history.getChangedBy(), history.getChangedAt());
    }
}
