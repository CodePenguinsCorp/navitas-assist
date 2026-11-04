package br.com.navitasassist.controller;

import br.com.navitasassist.rma.RmaReportRequest;
import br.com.navitasassist.rma.RmaReportResponse;
import br.com.navitasassist.service.RmaReportService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/reports/rmas")
@RequiredArgsConstructor
public class RmaReportController {
    private final RmaReportService rmaReportService;

    @GetMapping
    public RmaReportResponse search(@Valid @ModelAttribute RmaReportRequest filters) {
        return rmaReportService.search(filters);
    }
}
