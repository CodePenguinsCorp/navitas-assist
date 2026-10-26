package br.com.navitasassist.controller;

import br.com.navitasassist.checklist.ChecklistModels.*;
import br.com.navitasassist.service.RmaOperationsService;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/checklist-templates")
@RequiredArgsConstructor
public class ChecklistTemplateController {
    private final RmaOperationsService service;

    @GetMapping
    public List<Template> list() {
        return service.templates();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('ADMIN')")
    public Template create(@Valid @RequestBody TemplateRequest request) {
        return service.createTemplate(request);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public Template update(@PathVariable long id, @Valid @RequestBody TemplateRequest request) {
        return service.updateTemplate(id, request);
    }
}
