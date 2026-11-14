package br.com.navitasassist.controller;

import br.com.navitasassist.service.RmaReportPdfService;
import br.com.navitasassist.service.RmaReportPdfService.PdfFile;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class RmaTechnicalReportController {
    private final RmaReportPdfService rmaReportPdfService;

    @GetMapping("/api/rmas/{id}/report.pdf")
    public ResponseEntity<byte[]> download(@PathVariable Long id) {
        PdfFile file = rmaReportPdfService.laudo(id);
        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_PDF)
            .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(file.filename()).build().toString())
            .body(file.content());
    }
}
