package br.com.navitasassist.service;

import java.time.Instant;
import java.time.LocalDate;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

import br.com.navitasassist.config.RmaDeadlineProperties;
import br.com.navitasassist.repository.RmaDashboardRepository;
import br.com.navitasassist.rma.ItemWarranty;
import br.com.navitasassist.rma.RmaDashboardResponse;
import br.com.navitasassist.rma.RmaPriority;
import br.com.navitasassist.rma.RmaStatus;
import br.com.navitasassist.rma.WarrantyStatus;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Indicadores do dashboard: mesmos universos da tela (garantia de todos os itens, prazos só de OS abertas). */
@Service
@RequiredArgsConstructor
public class RmaDashboardService {
    private static final Set<RmaStatus> CLOSED = EnumSet.of(RmaStatus.COMPLETED, RmaStatus.RETURNED, RmaStatus.IRREPARABLE);
    private static final Set<RmaStatus> INITIAL_QUEUE = EnumSet.of(RmaStatus.RECEIVED, RmaStatus.TRIAGE);
    private static final int QUEUE_SIZE = 5;
    private static final int RECENT_SIZE = 4;

    private final RmaDashboardRepository repository;
    private final RmaDeadlineProperties deadlineProperties;

    @Transactional(readOnly = true)
    public RmaDashboardResponse summarize() {
        Map<RmaStatus, Long> statusCounts = new EnumMap<>(RmaStatus.class);
        for (RmaStatus status : RmaStatus.values()) statusCounts.put(status, 0L);
        for (Object[] row : repository.countByStatus()) statusCounts.put((RmaStatus) row[0], ((Number) row[1]).longValue());

        long[] warranty = new long[3];
        for (Object[] row : repository.itemWarrantyInputs()) {
            WarrantyStatus override = (WarrantyStatus) row[4];
            count(warranty, override != null ? override : warrantyOf(row));
        }
        for (Object[] row : repository.legacyWarrantyInputs()) count(warranty, warrantyOf(row));

        LocalDate today = RmaDeadlineService.businessDate(Instant.now());
        return new RmaDashboardResponse(
            statusCounts,
            repository.countByStatusInAndPriority(INITIAL_QUEUE, RmaPriority.HIGH),
            repository.countOverdue(CLOSED, today),
            repository.countDueSoon(CLOSED, today, today.plusDays(deadlineProperties.getWarningDays())),
            warranty[0],
            warranty[1],
            warranty[2],
            repository.findQueue(CLOSED, PageRequest.of(0, QUEUE_SIZE)),
            repository.findRecent(PageRequest.of(0, RECENT_SIZE)),
            repository.findRecentStatusEvents(PageRequest.of(0, RECENT_SIZE))
        );
    }

    private static WarrantyStatus warrantyOf(Object[] row) {
        return ItemWarranty.calculate(Boolean.TRUE.equals(row[0]), (LocalDate) row[1], (LocalDate) row[2], ((Number) row[3]).intValue()).status();
    }

    private static void count(long[] totals, WarrantyStatus status) {
        totals[0]++;
        if (status == WarrantyStatus.IN_WARRANTY) totals[1]++;
        if (status == WarrantyStatus.PENDING) totals[2]++;
    }
}
