package br.com.navitasassist.service;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;

import br.com.navitasassist.diagnosis.DiagnosisResponse;
import br.com.navitasassist.part.PartReservationStatus;
import br.com.navitasassist.report.RmaTechnicalReport;
import br.com.navitasassist.report.RmaTechnicalReport.ConsumedPart;
import br.com.navitasassist.rma.ReportLabels;
import br.com.navitasassist.rma.RmaItemResponse;
import br.com.navitasassist.rma.RmaResponse;
import com.lowagie.text.Document;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.Rectangle;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Final technical report (laudo) of one RMA as PDF. Uses the standard Helvetica font with Cp1252 encoding, which covers
 * Portuguese accents without embedding fonts or fetching anything at runtime.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class RmaReportPdfService {
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Sao_Paulo");
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final DateTimeFormatter INSTANT = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm").withZone(BUSINESS_ZONE);
    private static final String EMPTY = "Não informado";
    private static final Color MUTED = new Color(90, 98, 110);
    private static final Color LINE = new Color(210, 214, 220);
    private static final Font TITLE = new Font(Font.HELVETICA, 16, Font.BOLD);
    private static final Font SECTION = new Font(Font.HELVETICA, 11, Font.BOLD);
    private static final Font LABEL = new Font(Font.HELVETICA, 8, Font.BOLD, MUTED);
    private static final Font TEXT = new Font(Font.HELVETICA, 9);

    private final RmaService rmaService;
    private final PartStockService partStockService;

    public PdfFile laudo(Long rmaId) {
        RmaResponse rma = rmaService.getById(rmaId);
        List<ConsumedPart> consumed = partStockService.getRmaParts(rmaId).reservations().stream()
            .filter(reservation -> reservation.status() == PartReservationStatus.CONSUMED)
            .map(reservation -> new ConsumedPart(reservation.partCode(), reservation.partName(), reservation.quantity(), reservation.unit()))
            .toList();
        RmaTechnicalReport report = new RmaTechnicalReport(rma, consumed, Instant.now());
        return new PdfFile("laudo-" + rma.code().replaceAll("[^A-Za-z0-9_-]", "-") + ".pdf", render(report));
    }

    byte[] render(RmaTechnicalReport report) {
        RmaResponse rma = report.rma();
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        Document document = new Document(PageSize.A4, 40, 40, 40, 40);
        PdfWriter.getInstance(document, output);
        document.addTitle("Laudo técnico " + rma.code());
        document.open();

        Paragraph title = new Paragraph("Laudo técnico · " + rma.code(), TITLE);
        title.setSpacingAfter(10);
        document.add(title);
        document.add(fields(
            "Cliente", rma.clientName(), "Status", ReportLabels.status(rma.status()),
            "Entrada", date(rma.entryDate()), "Emitido em", INSTANT.format(report.generatedAt()) + " (São Paulo)"));

        section(document, "Produtos");
        PdfPTable items = table(new float[] {3, 2, 2, 2, 2}, "Produto", "SKU", "Lote", "Série", "Garantia");
        for (RmaItemResponse item : rma.items()) {
            cells(items, item.productName(), item.productSku(), item.batchNumber(), item.serialNumber(),
                ReportLabels.warranty(item.warrantyStatus()) + (item.warrantyOverride() == null ? "" : " (ajuste manual)"));
        }
        document.add(items);

        section(document, "Falha relatada");
        document.add(text(rma.reportedFailure()));

        section(document, "Falha encontrada");
        DiagnosisResponse diagnosis = rma.diagnosis();
        if (diagnosis == null) {
            document.add(text("Diagnóstico pendente"));
        } else {
            document.add(text(diagnosis.foundFailure()));
            document.add(fields(
                "Tipo de falha", value(ReportLabels.failureType(diagnosis.failureType())),
                "Causa provável", value(ReportLabels.failureCause(diagnosis.probableCause())),
                "Técnico", value(diagnosis.technicianName()), "Data do diagnóstico", date(diagnosis.diagnosedAt()),
                "Notas", value(diagnosis.notes()), "", ""));
        }

        section(document, "Ações executadas");
        document.add(fields("Reparo", value(rma.repairSummary()), "Testes", value(rma.testSummary())));

        section(document, "Peças trocadas");
        document.add(text(rma.replacedPartsSummary()));
        if (!report.consumedParts().isEmpty()) {
            PdfPTable parts = table(new float[] {2, 5, 2}, "Código", "Peça", "Quantidade");
            report.consumedParts().forEach(part -> cells(parts, part.code(), part.name(), quantity(part.quantity()) + " " + part.unit()));
            document.add(parts);
        }

        section(document, "Observações");
        document.add(fields("Estado físico", value(rma.physicalCondition()), "Acessórios recebidos", value(rma.receivedAccessories())));
        document.close();
        return output.toByteArray();
    }

    private static void section(Document document, String name) {
        Paragraph paragraph = new Paragraph(name, SECTION);
        paragraph.setSpacingBefore(12);
        paragraph.setSpacingAfter(4);
        document.add(paragraph);
    }

    private static Paragraph text(String value) {
        return new Paragraph(value(value), TEXT);
    }

    /** Label and value pairs, two pairs per row. */
    private static PdfPTable fields(String... pairs) {
        PdfPTable table = new PdfPTable(2);
        table.setWidthPercentage(100);
        table.setSpacingBefore(2);
        for (int index = 0; index < pairs.length; index += 2) {
            Phrase phrase = new Phrase();
            if (!pairs[index].isEmpty()) {
                phrase.add(new Phrase(pairs[index] + "\n", LABEL));
                phrase.add(new Phrase(pairs[index + 1], TEXT));
            }
            PdfPCell cell = new PdfPCell(phrase);
            cell.setBorder(Rectangle.NO_BORDER);
            cell.setPaddingBottom(6);
            table.addCell(cell);
        }
        return table;
    }

    private static PdfPTable table(float[] widths, String... headers) {
        PdfPTable table = new PdfPTable(widths);
        table.setWidthPercentage(100);
        table.setSpacingBefore(4);
        table.setHeaderRows(1);
        for (String header : headers) {
            PdfPCell cell = new PdfPCell(new Phrase(header, LABEL));
            cell.setBorder(Rectangle.BOTTOM);
            cell.setBorderColor(LINE);
            cell.setPadding(4);
            table.addCell(cell);
        }
        return table;
    }

    private static void cells(PdfPTable table, String... values) {
        for (String value : values) {
            PdfPCell cell = new PdfPCell(new Phrase(value(value), TEXT));
            cell.setBorder(Rectangle.BOTTOM);
            cell.setBorderColor(LINE);
            cell.setPadding(4);
            cell.setVerticalAlignment(Element.ALIGN_TOP);
            table.addCell(cell);
        }
    }

    private static String value(String value) {
        return value == null || value.isBlank() ? EMPTY : value;
    }

    private static String date(LocalDate value) {
        return value == null ? EMPTY : value.format(DATE);
    }

    private static String quantity(BigDecimal value) {
        return value.stripTrailingZeros().toPlainString().replace('.', ',');
    }

    public record PdfFile(String filename, byte[] content) {}
}
