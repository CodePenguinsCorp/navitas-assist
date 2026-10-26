package br.com.navitasassist.controller;

import java.util.List;
import br.com.navitasassist.kanban.WipLimitRequest;
import br.com.navitasassist.kanban.WipLimitResponse;
import br.com.navitasassist.service.WipService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/kanban-wip")
public class WipController {
    private final WipService service;
    @GetMapping
    public List<WipLimitResponse> list() { return service.list(); }
    @PutMapping("/{status}")
    @PreAuthorize("hasRole('ADMIN')")
    public WipLimitResponse update(@PathVariable String status, @Valid @RequestBody WipLimitRequest request) {
        return service.update(status, request);
    }
}
