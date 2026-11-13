package br.com.navitasassist.service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;

import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.pagination.PageParams;
import br.com.navitasassist.pagination.PageResponse;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.rma.ReportLabels;
import br.com.navitasassist.rma.RmaItemResponse;
import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.rma.RmaReportItems;
import br.com.navitasassist.rma.RmaReportSummaryResponse;
import br.com.navitasassist.rma.RmaReportSummaryResponse.CountRow;
import br.com.navitasassist.rma.RmaReportSummaryResponse.RateRow;
import br.com.navitasassist.rma.RmaReportSummaryResponse.Recurrence;
import br.com.navitasassist.rma.RmaReportSummaryResponse.SerialRow;
import br.com.navitasassist.rma.RmaReportSummaryResponse.StageRow;
import br.com.navitasassist.rma.RmaStagePeriodResponse;
import br.com.navitasassist.rma.RmaStatus;
import br.com.navitasassist.rma.WarrantyStatus;
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
    static final int TOP_LIMIT = 10;
    /** Most RMAs the summary and the CSV exports load for one period. */
    static final int MAX_REPORT_RMAS = 5000;
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Sao_Paulo");
    private static final Set<RmaStatus> CLOSED_STATUSES = EnumSet.of(RmaStatus.COMPLETED, RmaStatus.RETURNED, RmaStatus.IRREPARABLE);
    private static final List<WarrantyStatus> WARRANTY_ORDER = List.of(WarrantyStatus.IN_WARRANTY, WarrantyStatus.OUT_OF_WARRANTY, WarrantyStatus.PENDING);
    private static final DateTimeFormatter MONTH_LABEL = DateTimeFormatter.ofPattern("MM/yyyy");

    private final RmaRecordRepository rmaRecordRepository;
    private final RmaStageTimeService rmaStageTimeService;

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

    public RmaReportSummaryResponse summary(RmaReportRequest filters) {
        Period period = period(filters);
        ensureWithinLimit(filters, period);
        Instant generatedAt = Instant.now();
        List<RmaRecord> records = loadPeriod(filters, period);
        List<RmaRecord> open = records.stream().filter(rma -> !CLOSED_STATUSES.contains(rma.getStatus())).toList();
        if (!open.isEmpty()) {
            rmaRecordRepository.fetchStatusHistory(open);
        }
        List<ReportItem> items = items(records);

        Map<RmaStatus, Long> statusCounts = new EnumMap<>(RmaStatus.class);
        records.forEach(rma -> statusCounts.merge(rma.getStatus(), 1L, Long::sum));
        List<CountRow> byStatus = statusCounts.entrySet().stream()
            .map(entry -> new CountRow(entry.getKey().name(), ReportLabels.status(entry.getKey()), entry.getValue())).toList();
        List<CountRow> byWarranty = WARRANTY_ORDER.stream().map(warranty -> new CountRow(warranty.name(), ReportLabels.warranty(warranty),
            items.stream().filter(item -> item.view().warrantyStatus() == warranty).count())).toList();
        List<CountRow> byMonth = new ArrayList<>();
        for (YearMonth month = YearMonth.from(period.from()); !month.isAfter(YearMonth.from(period.to())); month = month.plusMonths(1)) {
            YearMonth current = month;
            byMonth.add(new CountRow(month.toString(), month.format(MONTH_LABEL),
                records.stream().filter(rma -> YearMonth.from(rma.getEntryDate()).equals(current)).count()));
        }

        return new RmaReportSummaryResponse(generatedAt, period.from(), period.to(), records.size(), items.size(),
            byStatus, byWarranty, byMonth,
            top(items, item -> productKey(item.product()), item -> productLabel(item.product())),
            top(items.stream().filter(item -> hasText(item.view().batchNumber())).toList(), RmaReportService::batchKey, RmaReportService::batchLabel),
            top(items, item -> String.valueOf(item.rma().getClient().getId()), item -> item.rma().getClient().getLegalName()),
            top(records.stream().filter(rma -> rma.getDiagnosis() != null && rma.getDiagnosis().getFailureType() != null).toList(),
                rma -> rma.getDiagnosis().getFailureType().name(), rma -> ReportLabels.failureType(rma.getDiagnosis().getFailureType())),
            recurrence(items, period),
            stages(open, generatedAt));
    }

    /** One entry per item as the API shows it (legacy RMAs without rma_items count their single product). */
    static List<ReportItem> items(List<RmaRecord> records) {
        return records.stream()
            .flatMap(rma -> rma.getItems().isEmpty()
                ? RmaReportItems.of(rma).stream().map(item -> new ReportItem(rma, rma.getProduct(), item))
                : rma.getItems().stream().map(item -> new ReportItem(rma, item.getProduct(), RmaItemResponse.from(item))))
            .toList();
    }

    /** RMAs of the period with items and products loaded, for the summary and the exports. */
    List<RmaRecord> loadPeriod(RmaReportRequest filters, Period period) {
        List<RmaRecord> records = rmaRecordRepository.searchReport(period.from(), period.to(), filters.status(), filters.clientId());
        if (!records.isEmpty()) {
            rmaRecordRepository.fetchItemsWithProducts(records);
        }
        return records;
    }

    /** The summary and the CSV exports load the whole period in memory: refuse instead of truncating above the cap. */
    void ensureWithinLimit(RmaReportRequest filters, Period period) {
        if (rmaRecordRepository.countReport(period.from(), period.to(), filters.status(), filters.clientId()) > MAX_REPORT_RMAS) {
            throw new BusinessException("Reduza o período: o relatório passa de 5.000 RMAs.");
        }
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

    private Recurrence recurrence(List<ReportItem> items, Period period) {
        Map<String, Long> recurrent = new HashMap<>();
        for (Object[] row : rmaRecordRepository.findRecurrentSerials(period.from(), period.to())) {
            recurrent.put(row[0] + "|" + normalizeSerial((String) row[1]), ((Number) row[2]).longValue());
        }
        List<ReportItem> withSerial = items.stream().filter(item -> hasText(item.view().serialNumber())).toList();
        List<ReportItem> returned = withSerial.stream().filter(item -> recurrent.containsKey(serialKey(item))).toList();
        Map<String, SerialRow> serials = new LinkedHashMap<>();
        returned.forEach(item -> serials.putIfAbsent(serialKey(item), new SerialRow(item.view().serialNumber(), item.product().getName(),
            item.product().getSku(), recurrent.get(serialKey(item)))));
        return new Recurrence(withSerial.size(), returned.size(),
            rates(withSerial, recurrent, item -> productKey(item.product()), item -> productLabel(item.product())),
            rates(withSerial.stream().filter(item -> hasText(item.view().batchNumber())).toList(), recurrent,
                RmaReportService::batchKey, RmaReportService::batchLabel),
            serials.values().stream().sorted(Comparator.comparingLong(SerialRow::rmaCount).reversed().thenComparing(SerialRow::serialNumber))
                .limit(TOP_LIMIT).toList());
    }

    private static List<RateRow> rates(List<ReportItem> items, Map<String, Long> recurrent, Function<ReportItem, String> key,
        Function<ReportItem, String> label) {
        Map<String, long[]> counts = new LinkedHashMap<>();
        Map<String, String> labels = new HashMap<>();
        for (ReportItem item : items) {
            String current = key.apply(item);
            long[] count = counts.computeIfAbsent(current, ignored -> new long[2]);
            labels.putIfAbsent(current, label.apply(item));
            count[0]++;
            if (recurrent.containsKey(serialKey(item))) {
                count[1]++;
            }
        }
        return counts.entrySet().stream().filter(entry -> entry.getValue()[1] > 0)
            .map(entry -> new RateRow(entry.getKey(), labels.get(entry.getKey()), entry.getValue()[0], entry.getValue()[1]))
            .sorted(Comparator.comparingLong(RateRow::returnedItems).reversed().thenComparing(RateRow::label))
            .limit(TOP_LIMIT).toList();
    }

    private List<StageRow> stages(List<RmaRecord> open, Instant generatedAt) {
        Map<RmaStatus, List<Long>> durations = new EnumMap<>(RmaStatus.class);
        for (RmaRecord rma : open) {
            List<RmaStagePeriodResponse> periods = rmaStageTimeService.periods(rma, generatedAt);
            if (!periods.isEmpty()) {
                durations.computeIfAbsent(rma.getStatus(), ignored -> new ArrayList<>()).add(periods.get(periods.size() - 1).durationSeconds());
            }
        }
        return durations.entrySet().stream().map(entry -> new StageRow(entry.getKey(), ReportLabels.status(entry.getKey()), entry.getValue().size(),
            entry.getValue().stream().mapToLong(Long::longValue).sum() / entry.getValue().size(),
            entry.getValue().stream().mapToLong(Long::longValue).max().orElse(0))).toList();
    }

    private static <T> List<CountRow> top(List<T> values, Function<T, String> key, Function<T, String> label) {
        Map<String, CountRow> counts = new LinkedHashMap<>();
        for (T value : values) {
            String current = key.apply(value);
            CountRow row = counts.get(current);
            counts.put(current, new CountRow(current, row == null ? label.apply(value) : row.label(), row == null ? 1 : row.count() + 1));
        }
        return counts.values().stream().sorted(Comparator.comparingLong(CountRow::count).reversed().thenComparing(CountRow::label))
            .limit(TOP_LIMIT).toList();
    }

    private static String batchKey(ReportItem item) {
        return productKey(item.product()) + "|" + item.view().batchNumber();
    }

    private static String batchLabel(ReportItem item) {
        return item.view().batchNumber() + " · " + productLabel(item.product());
    }

    /** Same normalization as {@link RmaRecordRepository#findRecurrentSerials}: trim + upper (Locale.ROOT). */
    private static String serialKey(ReportItem item) {
        return item.product().getId() + "|" + normalizeSerial(item.view().serialNumber());
    }

    static String normalizeSerial(String serial) {
        return serial.trim().toUpperCase(java.util.Locale.ROOT);
    }

    private static String productKey(Product product) {
        return String.valueOf(product.getId());
    }

    private static String productLabel(Product product) {
        return product.getName() + " (" + product.getSku() + ")";
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    record ReportItem(RmaRecord rma, Product product, RmaItemResponse view) {}

    record Period(LocalDate from, LocalDate to) {}
}
