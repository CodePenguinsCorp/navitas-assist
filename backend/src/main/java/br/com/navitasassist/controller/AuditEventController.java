package br.com.navitasassist.controller;

import br.com.navitasassist.audit.AuditEventResponse;
import br.com.navitasassist.pagination.PageResponse;
import br.com.navitasassist.service.AuditService;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/audit-events")
@RequiredArgsConstructor
public class AuditEventController {
    private final AuditService service;
    @GetMapping
    public PageResponse<AuditEventResponse> search(
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
        @RequestParam(required = false) String actor, @RequestParam(required = false) String action,
        @RequestParam(required = false) String entityType, @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer size) {
        return service.search(from, to, actor, action, entityType, page, size);
    }
}
