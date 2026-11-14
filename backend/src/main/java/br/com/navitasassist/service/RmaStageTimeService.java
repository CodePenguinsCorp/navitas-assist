package br.com.navitasassist.service;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.rma.RmaStagePeriodResponse;
import br.com.navitasassist.rma.RmaStatus;
import br.com.navitasassist.rma.RmaStatusHistory;
import org.springframework.stereotype.Service;

/**
 * Splits the status history of an RMA into stage periods. Consecutive records of the same status (notes, priority
 * changes) belong to one period; leaving and returning to a stage opens a new one. The list is chronological, never
 * empty, and its last item is the current stage.
 */
@Service
public class RmaStageTimeService {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Sao_Paulo");

    public List<RmaStagePeriodResponse> periods(RmaRecord rma, Instant now) {
        List<RmaStatusHistory> history = rma.getStatusHistory().stream()
            .filter(event -> event.getChangedAt() != null && event.getStatus() != null)
            .sorted(Comparator.comparing(RmaStatusHistory::getChangedAt)
                .thenComparing(RmaStatusHistory::getId, Comparator.nullsLast(Comparator.naturalOrder())))
            .toList();

        List<Block> blocks = new ArrayList<>();
        for (RmaStatusHistory event : history) {
            if (blocks.isEmpty() || blocks.get(blocks.size() - 1).status() != event.getStatus()) {
                blocks.add(new Block(event.getStatus(), event.getChangedAt()));
            }
        }
        if (blocks.isEmpty()) {
            blocks.add(new Block(rma.getStatus(), fallbackStart(rma, now)));
        } else if (blocks.get(blocks.size() - 1).status() != rma.getStatus()) {
            // Inconsistent legacy history: the current stage starts at the last recorded change.
            blocks.add(new Block(rma.getStatus(), history.get(history.size() - 1).getChangedAt()));
        }

        List<RmaStagePeriodResponse> periods = new ArrayList<>(blocks.size());
        for (int index = 0; index < blocks.size(); index++) {
            Block block = blocks.get(index);
            Instant leftAt = index + 1 < blocks.size() ? blocks.get(index + 1).enteredAt() : null;
            long seconds = Math.max(0, Duration.between(block.enteredAt(), leftAt == null ? now : leftAt).getSeconds());
            periods.add(new RmaStagePeriodResponse(block.status(), block.enteredAt(), leftAt, seconds));
        }
        return periods;
    }

    private Instant fallbackStart(RmaRecord rma, Instant now) {
        if (rma.getCreatedAt() != null) {
            return rma.getCreatedAt();
        }
        return rma.getEntryDate() == null ? now : rma.getEntryDate().atStartOfDay(BUSINESS_ZONE).toInstant();
    }

    private record Block(RmaStatus status, Instant enteredAt) {}
}
