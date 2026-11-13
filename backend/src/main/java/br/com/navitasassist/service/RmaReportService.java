package br.com.navitasassist.service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;

import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.pagination.PageParams;
import br.com.navitasassist.pagination.PageResponse;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.rma.RmaReportPageResponse;
import br.com.navitasassist.rma.RmaReportRequest;
import br.com.navitasassist.rma.RmaReportRowResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Report queries are bounded by the entry period (default: the last {@value #DEFAULT_PERIOD_DAYS} days, at most
 * {@value #MAX_PERIOD_DAYS}) and load the RMA graph with a fixed number of queries instead of one per RMA.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class RmaReportService {
    static final int DEFAULT_PERIOD_DAYS = 90;
    static final int MAX_PERIOD_DAYS = 366;
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Sao_Paulo");

    private final RmaRecordRepository rmaRecordRepository;

    public RmaReportPageResponse search(RmaReportRequest filters) {
        Period period = period(filters);
        Instant generatedAt = Instant.now();
        Page<RmaRecord> page = rmaRecordRepository.searchReportPage(period.from(), period.to(), filters.status(), filters.clientId(),
            PageParams.of(filters.page(), filters.size()));
        if (!page.isEmpty()) {
            rmaRecordRepository.fetchItemsWithProducts(page.getContent());
        }
        return new RmaReportPageResponse(generatedAt, period.from(), period.to(), PageResponse.from(page, RmaReportRowResponse::from));
    }

    /** RMAs of the period with items and products loaded, for the summary and the exports. */
    List<RmaRecord> loadPeriod(RmaReportRequest filters, Period period) {
        List<RmaRecord> records = rmaRecordRepository.searchReport(period.from(), period.to(), filters.status(), filters.clientId());
        if (!records.isEmpty()) {
            rmaRecordRepository.fetchItemsWithProducts(records);
        }
        return records;
    }

    Period period(RmaReportRequest filters) {
        if (filters.entryFrom() != null && filters.entryTo() != null && filters.entryFrom().isAfter(filters.entryTo())) {
            throw new BusinessException("Entry start date must not be after end date.");
        }
        LocalDate today = LocalDate.now(BUSINESS_ZONE);
        LocalDate entryTo = filters.entryTo() != null ? filters.entryTo()
            : filters.entryFrom() != null && filters.entryFrom().plusDays(MAX_PERIOD_DAYS - 1).isBefore(today) ? filters.entryFrom().plusDays(MAX_PERIOD_DAYS - 1)
            : today;
        LocalDate entryFrom = filters.entryFrom() != null ? filters.entryFrom() : entryTo.minusDays(DEFAULT_PERIOD_DAYS - 1);
        if (entryFrom.isAfter(entryTo)) {
            entryTo = entryFrom;
        }
        if (ChronoUnit.DAYS.between(entryFrom, entryTo) + 1 > MAX_PERIOD_DAYS) {
            throw new BusinessException("Report period must be at most " + MAX_PERIOD_DAYS + " days.");
        }
        return new Period(entryFrom, entryTo);
    }

    record Period(LocalDate from, LocalDate to) {}
}
