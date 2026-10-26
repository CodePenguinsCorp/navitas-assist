package br.com.navitasassist.service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;

import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.rma.RmaReportRequest;
import br.com.navitasassist.rma.RmaReportResponse;
import br.com.navitasassist.rma.RmaResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Report queries are bounded by the entry period (default: the last {@value #DEFAULT_PERIOD_DAYS} days) and load the RMA
 * graph with a fixed number of queries instead of one per RMA.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class RmaReportService {
    static final int DEFAULT_PERIOD_DAYS = 90;
    static final int MAX_PERIOD_DAYS = 366;
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Sao_Paulo");

    private final RmaRecordRepository rmaRecordRepository;
    private final RmaSlaService rmaSlaService;

    public RmaReportResponse search(RmaReportRequest filters) {
        if (filters.entryFrom() != null && filters.entryTo() != null && filters.entryFrom().isAfter(filters.entryTo())) {
            throw new BusinessException("Entry start date must not be after end date.");
        }
        LocalDate entryTo = filters.entryTo() != null ? filters.entryTo()
            : filters.entryFrom() != null ? filters.entryFrom().plusDays(MAX_PERIOD_DAYS - 1).isBefore(today()) ? filters.entryFrom().plusDays(MAX_PERIOD_DAYS - 1) : today()
            : today();
        LocalDate entryFrom = filters.entryFrom() != null ? filters.entryFrom() : entryTo.minusDays(DEFAULT_PERIOD_DAYS - 1);
        if (entryFrom.isAfter(entryTo)) {
            entryTo = entryFrom;
        }
        if (ChronoUnit.DAYS.between(entryFrom, entryTo) + 1 > MAX_PERIOD_DAYS) {
            throw new BusinessException("Report period must be at most " + MAX_PERIOD_DAYS + " days.");
        }

        Instant generatedAt = Instant.now();
        List<RmaRecord> records = rmaRecordRepository.searchReport(entryFrom, entryTo, filters.status(), filters.clientId());
        if (!records.isEmpty()) {
            rmaRecordRepository.fetchItemsWithProducts(records);
            rmaRecordRepository.fetchStatusHistory(records);
            rmaRecordRepository.fetchAssignmentHistory(records);
        }
        List<RmaResponse> rmas = records.stream().map(rma -> RmaResponse.from(rma, rmaSlaService.calculate(rma, generatedAt))).toList();
        return new RmaReportResponse(generatedAt, entryFrom, entryTo, rmas);
    }

    private LocalDate today() {
        return LocalDate.now(BUSINESS_ZONE);
    }
}
