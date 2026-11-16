package br.com.navitasassist.service;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

import br.com.navitasassist.diagnosis.DiagnosisResponse;
import br.com.navitasassist.report.RmaTechnicalReport;
import br.com.navitasassist.report.RmaTechnicalReport.ReplacedComponent;
import br.com.navitasassist.rma.InterventionResponse;
import br.com.navitasassist.rma.ReportLabels;
import br.com.navitasassist.rma.RmaItemResponse;
import br.com.navitasassist.rma.RmaDetailResponse;
import com.lowagie.text.Document;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.Rectangle;
import com.lowagie.text.pdf.BaseFont;
import com.lowagie.text.pdf.PdfContentByte;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfPageEventHelper;
import com.lowagie.text.pdf.PdfTemplate;
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
    private static final String EMPTY = "—";
    private static final Color MUTED = new Color(90, 98, 110);
    private static final Color LINE = new Color(210, 214, 220);
    private static final Color ACCENT = new Color(31, 58, 95);
    private static final Color HEADER_BACKGROUND = new Color(238, 240, 243);
    private static final Font TITLE = new Font(Font.HELVETICA, 16, Font.BOLD);
    private static final Font SECTION = new Font(Font.HELVETICA, 10, Font.BOLD, ACCENT);
    private static final Font LABEL = new Font(Font.HELVETICA, 8, Font.BOLD, MUTED);
    private static final Font TEXT = new Font(Font.HELVETICA, 9);
    private static final Font BANNER = new Font(Font.HELVETICA, 9, Font.BOLD, new Color(120, 80, 0));

    private final RmaService rmaService;
    private final PartStockService partStockService;
    private final RmaRepairService repairService;
    private final ExportStatementTimeout exportTimeout;

    public PdfFile laudo(Long rmaId) {
        exportTimeout.extend();
        RmaDetailResponse rma = rmaService.getById(rmaId);
        List<ReplacedComponent> components = new ArrayList<>(partStockService.getRmaParts(rmaId).replacedComponents().stream()
            .map(usage -> new ReplacedComponent(usage.partCode(), usage.partName(), usage.quantity(), usage.unit(),
                usage.componentBatch(), usage.replacementReason(), usage.appliedAt(), usage.appliedBy(), "Estoque"))
            .toList());
        repairService.listExternalComponents(rmaId).stream().filter(item -> item.voidedAt() == null).forEach(component -> components.add(new ReplacedComponent(component.code(), component.description(),
            component.quantity(), component.unit(), component.componentBatch(), component.replacementReason(), component.appliedAt(), component.appliedBy(), "Externo")));
        var repair = repairService.getRepair(rmaId);
        RmaTechnicalReport report = new RmaTechnicalReport(rma, components, repair.interventions(), repair.totalServiceHours(), Instant.now());
        return new PdfFile("laudo-" + rma.code().replaceAll("[^A-Za-z0-9_-]", "-") + ".pdf", render(report));
    }

    byte[] render(RmaTechnicalReport report) {
        RmaDetailResponse rma = report.rma();
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        Document document = new Document(PageSize.A4, 40, 40, 40, 56);
        PdfWriter writer = PdfWriter.getInstance(document, output);
        writer.setPageEvent(new FooterEvent(rma.code(), INSTANT.format(report.generatedAt())));
        document.addTitle("Laudo técnico " + rma.code());
        document.open();

        Paragraph title = new Paragraph("Laudo técnico · " + rma.code(), TITLE);
        title.setSpacingAfter(8);
        document.add(title);
        DiagnosisResponse diagnosis = rma.diagnosis();
        if (diagnosis == null) {
            document.add(banner("Laudo parcial: diagnóstico ainda não registrado"));
        }
        document.add(fields(
            "Cliente", dash(rma.clientName()), "Status", dash(ReportLabels.status(rma.status())),
            "Entrada", dash(date(rma.entryDate())), "Emitido em", INSTANT.format(report.generatedAt()) + " (São Paulo)"));

        section(document, "Produtos");
        PdfPTable items = table(new float[] {3.2f, 2f, 2f, 2f, 2.6f}, "Produto", "SKU", "Lote", "Série", "Garantia");
        for (RmaItemResponse item : rma.items()) {
            cells(items, item.productName(), item.productSku(), item.batchNumber(), item.serialNumber(),
                ReportLabels.warranty(item.warrantyStatus()) + (item.warrantyOverride() == null ? "" : "\n(ajuste manual)"));
        }
        document.add(items);

        PdfPTable received = fields("Estado físico", rma.physicalCondition(), "Acessórios recebidos", rma.receivedAccessories());
        if (received != null) {
            section(document, "Equipamento recebido");
            document.add(received);
        }

        section(document, "Falha relatada");
        document.add(text(rma.reportedFailure()));

        if (diagnosis != null) {
            section(document, "Falha encontrada");
            document.add(text(diagnosis.foundFailure()));
            addIfPresent(document, fields(
                "Tipo de falha", diagnosis.failureType(),
                "Causa provável", diagnosis.probableCause(),
                "Técnico", diagnosis.technicianName(), "Data do diagnóstico", date(diagnosis.diagnosedAt()),
                "Notas", diagnosis.notes()));
        }

        section(document, "Peças trocadas");
        if (report.replacedComponents().isEmpty()) {
            document.add(text("Sem peças trocadas"));
        } else {
            PdfPTable parts = table(new float[] {2f, 4f, 1.6f, 2f, 4.4f}, "Código", "Descrição", "Quantidade", "Lote", "Motivo");
            report.replacedComponents().forEach(part -> cells(parts, part.code(),
                part.description() + ("Externo".equals(part.source()) ? "\nExterno" : ""),
                quantity(part.quantity()) + (part.unit() == null ? "" : " " + part.unit()), part.componentBatch(),
                dash(part.replacementReason()) + (part.appliedAt() == null ? "" : "\n" + INSTANT.format(part.appliedAt()) + " - " + dash(part.appliedBy()))));
            document.add(parts);
        }

        section(document, "Reparos");
        List<InterventionResponse> active = report.interventions().stream().filter(item -> item.voidedAt() == null).toList();
        if (active.isEmpty()) {
            document.add(text("Sem reparos registrados"));
        } else {
            PdfPTable interventions = table(new float[] {1.8f, 2.6f, 2.8f, 5.6f, 1.8f}, "Data", "Técnico", "Tipo", "Descrição", "Duração");
            active.forEach(item -> cells(interventions, date(item.performedOn()), item.technicianName(), item.type(),
                item.description(), item.hours() == null ? null : quantity(item.hours()) + " h"));
            document.add(interventions);
            if (active.stream().anyMatch(item -> item.hours() != null)) {
                Paragraph total = new Paragraph("Total de horas: " + quantity(report.totalServiceHours()) + " h", SECTION);
                total.setSpacingBefore(4);
                total.setAlignment(Element.ALIGN_RIGHT);
                document.add(total);
            }
        }

        document.add(signatures(technicianName(report, active)));
        document.close();
        return output.toByteArray();
    }

    private static String technicianName(RmaTechnicalReport report, List<InterventionResponse> active) {
        DiagnosisResponse diagnosis = report.rma().diagnosis();
        if (diagnosis != null && diagnosis.technicianName() != null && !diagnosis.technicianName().isBlank()) {
            return diagnosis.technicianName();
        }
        return active.stream().map(InterventionResponse::technicianName).filter(name -> name != null && !name.isBlank()).findFirst().orElse(null);
    }

    private static void section(Document document, String name) {
        PdfPTable bar = new PdfPTable(1);
        bar.setWidthPercentage(100);
        bar.setSpacingBefore(14);
        bar.setSpacingAfter(4);
        bar.setKeepTogether(true);
        PdfPCell cell = new PdfPCell(new Phrase(name, SECTION));
        cell.setBorder(Rectangle.BOTTOM);
        cell.setBorderWidthBottom(1.5f);
        cell.setBorderColor(ACCENT);
        cell.setPaddingLeft(0);
        cell.setPaddingBottom(3);
        bar.addCell(cell);
        document.add(bar);
    }

    private static PdfPTable banner(String message) {
        PdfPTable table = new PdfPTable(1);
        table.setWidthPercentage(100);
        table.setSpacingAfter(6);
        PdfPCell cell = new PdfPCell(new Phrase(message, BANNER));
        cell.setBackgroundColor(new Color(255, 244, 214));
        cell.setBorderColor(new Color(224, 190, 100));
        cell.setPadding(6);
        table.addCell(cell);
        return table;
    }

    private static PdfPTable signatures(String technician) {
        PdfPTable table = new PdfPTable(new float[] {5, 1, 5});
        table.setWidthPercentage(100);
        table.setSpacingBefore(40);
        table.setKeepTogether(true);
        table.addCell(signatureCell(technician, "Técnico responsável"));
        PdfPCell gap = new PdfPCell(new Phrase(""));
        gap.setBorder(Rectangle.NO_BORDER);
        table.addCell(gap);
        table.addCell(signatureCell(null, "Cliente"));
        return table;
    }

    private static PdfPCell signatureCell(String name, String label) {
        Phrase phrase = new Phrase();
        if (name != null && !name.isBlank()) {
            phrase.add(new Phrase(name + "\n", TEXT));
        }
        phrase.add(new Phrase(label, LABEL));
        PdfPCell cell = new PdfPCell(phrase);
        cell.setBorder(Rectangle.TOP);
        cell.setBorderColor(Color.BLACK);
        cell.setPaddingTop(4);
        cell.setHorizontalAlignment(Element.ALIGN_CENTER);
        return cell;
    }

    private static Paragraph text(String value) {
        return new Paragraph(dash(value), TEXT);
    }

    private static void addIfPresent(Document document, PdfPTable table) {
        if (table != null) {
            document.add(table);
        }
    }

    /** Label and value pairs, two pairs per row; pairs without value are omitted and null is returned if none is left. */
    private static PdfPTable fields(String... pairs) {
        List<String[]> present = new ArrayList<>();
        for (int index = 0; index < pairs.length; index += 2) {
            if (pairs[index + 1] != null && !pairs[index + 1].isBlank()) {
                present.add(new String[] {pairs[index], pairs[index + 1]});
            }
        }
        if (present.isEmpty()) {
            return null;
        }
        PdfPTable table = new PdfPTable(2);
        table.setWidthPercentage(100);
        table.setSpacingBefore(2);
        for (String[] pair : present) {
            Phrase phrase = new Phrase();
            phrase.add(new Phrase(pair[0] + "\n", LABEL));
            phrase.add(new Phrase(pair[1], TEXT));
            PdfPCell cell = new PdfPCell(phrase);
            cell.setBorder(Rectangle.NO_BORDER);
            cell.setPaddingBottom(6);
            table.addCell(cell);
        }
        table.completeRow();
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
            cell.setBackgroundColor(HEADER_BACKGROUND);
            cell.setPadding(4);
            table.addCell(cell);
        }
        return table;
    }

    private static void cells(PdfPTable table, String... values) {
        for (String value : values) {
            PdfPCell cell = new PdfPCell(new Phrase(dash(value), TEXT));
            cell.setBorder(Rectangle.BOTTOM);
            cell.setBorderColor(LINE);
            cell.setPadding(4);
            cell.setVerticalAlignment(Element.ALIGN_TOP);
            table.addCell(cell);
        }
    }

    private static String dash(String value) {
        return value == null || value.isBlank() ? EMPTY : value;
    }

    private static String date(LocalDate value) {
        return value == null ? null : value.format(DATE);
    }

    private static String quantity(BigDecimal value) {
        return value == null ? EMPTY : value.stripTrailingZeros().toPlainString().replace('.', ',');
    }

    /** Footer on every page: report code, emission time and "Página X de Y" (the total is filled when the document closes). */
    private static final class FooterEvent extends PdfPageEventHelper {
        private final String code;
        private final String issuedAt;
        private PdfTemplate total;
        private BaseFont font;

        FooterEvent(String code, String issuedAt) {
            this.code = code;
            this.issuedAt = issuedAt;
        }

        @Override
        public void onOpenDocument(PdfWriter writer, Document document) {
            total = writer.getDirectContent().createTemplate(40, 12);
            try {
                font = BaseFont.createFont(BaseFont.HELVETICA, BaseFont.CP1252, false);
            } catch (java.io.IOException exception) {
                throw new IllegalStateException(exception);
            }
        }

        @Override
        public void onEndPage(PdfWriter writer, Document document) {
            PdfContentByte canvas = writer.getDirectContent();
            float y = document.bottom() - 22;
            canvas.setColorStroke(LINE);
            canvas.moveTo(document.left(), y + 12);
            canvas.lineTo(document.right(), y + 12);
            canvas.stroke();
            canvas.setColorFill(MUTED);
            canvas.beginText();
            canvas.setFontAndSize(font, 8);
            canvas.setTextMatrix(document.left(), y);
            canvas.showText(code + " · Emitido em " + issuedAt + " (São Paulo)");
            canvas.endText();
            String label = "Página " + writer.getPageNumber() + " de ";
            float labelWidth = font.getWidthPoint(label, 8);
            float x = document.right() - labelWidth - 12;
            canvas.beginText();
            canvas.setFontAndSize(font, 8);
            canvas.setTextMatrix(x, y);
            canvas.showText(label);
            canvas.endText();
            canvas.addTemplate(total, x + labelWidth, y);
        }

        @Override
        public void onCloseDocument(PdfWriter writer, Document document) {
            total.beginText();
            total.setFontAndSize(font, 8);
            total.setColorFill(MUTED);
            total.setTextMatrix(0, 0);
            total.showText(String.valueOf(writer.getPageNumber() - 1));
            total.endText();
        }
    }

    public record PdfFile(String filename, byte[] content) {}
}
