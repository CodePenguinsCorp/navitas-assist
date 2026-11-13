package br.com.navitasassist.service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.report.CsvWriter;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.rma.ReportLabels;
import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.rma.RmaReportRequest;
import br.com.navitasassist.rma.RmaReportSummaryResponse;
import br.com.navitasassist.rma.RmaReportSummaryResponse.CountRow;
import br.com.navitasassist.rma.RmaReportSummaryResponse.RateRow;
import br.com.navitasassist.service.RmaReportService.Period;
import br.com.navitasassist.service.RmaReportService.ReportItem;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** CSV exports of the report: the RMA list with one line per item, and the summary as a long table. */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class RmaReportCsvService {
    static final int MAX_EXPORT_RMAS = 5000;
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private final RmaReportService rmaReportService;
    private final RmaRecordRepository rmaRecordRepository;

    public CsvFile rmas(RmaReportRequest filters) {
        Period period = rmaReportService.period(filters);
        if (rmaRecordRepository.countReport(period.from(), period.to(), filters.status(), filters.clientId()) > MAX_EXPORT_RMAS) {
            throw new BusinessException("Export is limited to " + MAX_EXPORT_RMAS + " RMAs. Narrow the period or the filters.");
        }
        List<RmaRecord> records = rmaReportService.loadPeriod(filters, period);
        CsvWriter csv = new CsvWriter().row("Código", "Entrada", "Status", "Cliente", "Produto", "SKU", "Lote", "Série", "Garantia",
            "Ajuste manual de garantia", "Falha relatada", "Falha encontrada", "Tipo de falha", "Causa provável", "Responsável", "Expedição");
        for (ReportItem item : RmaReportService.items(records)) {
            RmaRecord rma = item.rma();
            var diagnosis = rma.getDiagnosis();
            csv.row(rma.getCode(), date(rma.getEntryDate()), ReportLabels.status(rma.getStatus()), rma.getClient().getLegalName(),
                item.product().getName(), item.product().getSku(), item.view().batchNumber(), item.view().serialNumber(),
                ReportLabels.warranty(item.view().warrantyStatus()), item.view().warrantyOverride() == null ? "Não" : "Sim",
                rma.getReportedFailure(),
                diagnosis == null ? null : diagnosis.getFoundFailure(),
                diagnosis == null ? null : ReportLabels.failureType(diagnosis.getFailureType()),
                diagnosis == null ? null : ReportLabels.failureCause(diagnosis.getProbableCause()),
                rma.getAssignee() == null ? null : rma.getAssignee().getFullName(),
                date(rma.getShippedAt()));
        }
        return new CsvFile("rmas-" + period.from() + "-a-" + period.to() + ".csv", csv.toBytes());
    }

    public CsvFile summary(RmaReportRequest filters) {
        RmaReportSummaryResponse summary = rmaReportService.summary(filters);
        CsvWriter csv = new CsvWriter().row("Seção", "Item", "Quantidade", "Base", "Percentual", "Tempo médio (h)", "Maior tempo (h)");
        csv.row("Total", "RMAs", CsvWriter.number(summary.totalRmas()), null, null, null, null);
        csv.row("Total", "Itens", CsvWriter.number(summary.totalItems()), null, null, null, null);
        shares(csv, "Status", summary.byStatus(), summary.totalRmas());
        shares(csv, "Garantia", summary.byWarranty(), summary.totalItems());
        counts(csv, "Mês de entrada", summary.byMonth());
        counts(csv, "Top falhas por produto", summary.topProducts());
        counts(csv, "Top falhas por lote", summary.topBatches());
        counts(csv, "Top falhas por cliente", summary.topClients());
        counts(csv, "Top tipos de falha", summary.topFailureTypes());
        var recurrence = summary.recurrence();
        csv.row("Recorrência", "Itens com série", CsvWriter.number(recurrence.returnedItems()), CsvWriter.number(recurrence.itemsWithSerial()),
            percent(recurrence.returnedItems(), recurrence.itemsWithSerial()), null, null);
        rates(csv, "Recorrência por modelo", recurrence.byProduct());
        rates(csv, "Recorrência por lote", recurrence.byBatch());
        recurrence.serials().forEach(serial -> csv.row("Série que retornou", serial.serialNumber() + " · " + serial.productName() + " ("
            + serial.productSku() + ")", CsvWriter.number(serial.rmaCount()), null, null, null, null));
        summary.stages().forEach(stage -> csv.row("Tempo na etapa atual", stage.label(), CsvWriter.number(stage.count()), null, null,
            CsvWriter.decimal(stage.averageSeconds() / 3600.0), CsvWriter.decimal(stage.maximumSeconds() / 3600.0)));
        return new CsvFile("resumo-rmas-" + summary.entryFrom() + "-a-" + summary.entryTo() + ".csv", csv.toBytes());
    }

    private static void shares(CsvWriter csv, String section, List<CountRow> rows, long base) {
        rows.forEach(row -> csv.row(section, row.label(), CsvWriter.number(row.count()), CsvWriter.number(base), percent(row.count(), base), null, null));
    }

    private static void counts(CsvWriter csv, String section, List<CountRow> rows) {
        rows.forEach(row -> csv.row(section, row.label(), CsvWriter.number(row.count()), null, null, null, null));
    }

    private static void rates(CsvWriter csv, String section, List<RateRow> rows) {
        rows.forEach(row -> csv.row(section, row.label(), CsvWriter.number(row.returnedItems()), CsvWriter.number(row.items()),
            percent(row.returnedItems(), row.items()), null, null));
    }

    private static CsvWriter.Raw percent(long part, long base) {
        return base == 0 ? null : CsvWriter.decimal(100.0 * part / base);
    }

    private static String date(LocalDate value) {
        return value == null ? null : value.format(DATE);
    }

    public record CsvFile(String filename, byte[] content) {}
}
