package br.com.navitasassist.controller;

import br.com.navitasassist.rma.RmaReportPageResponse;
import br.com.navitasassist.rma.RmaReportRequest;
import br.com.navitasassist.rma.RmaReportSummaryResponse;
import br.com.navitasassist.service.RmaReportCsvService;
import br.com.navitasassist.service.RmaReportCsvService.CsvFile;
import br.com.navitasassist.service.RmaReportService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/reports/rmas")
@RequiredArgsConstructor
public class RmaReportController {
    private static final MediaType CSV = MediaType.parseMediaType("text/csv;charset=UTF-8");

    private final RmaReportService rmaReportService;
    private final RmaReportCsvService rmaReportCsvService;

    @GetMapping
    public RmaReportPageResponse search(@Valid @ModelAttribute RmaReportRequest filters) {
        return rmaReportService.search(filters);
    }

    @GetMapping("/summary")
    public RmaReportSummaryResponse summary(@Valid @ModelAttribute RmaReportRequest filters) {
        return rmaReportService.summary(filters);
    }

    @GetMapping("/export.csv")
    public ResponseEntity<byte[]> exportRmas(@Valid @ModelAttribute RmaReportRequest filters) {
        return csv(rmaReportCsvService.rmas(filters));
    }

    @GetMapping("/summary/export.csv")
    public ResponseEntity<byte[]> exportSummary(@Valid @ModelAttribute RmaReportRequest filters) {
        return csv(rmaReportCsvService.summary(filters));
    }

    private static ResponseEntity<byte[]> csv(CsvFile file) {
        return ResponseEntity.ok()
            .contentType(CSV)
            .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(file.filename()).build().toString())
            .body(file.content());
    }
}
