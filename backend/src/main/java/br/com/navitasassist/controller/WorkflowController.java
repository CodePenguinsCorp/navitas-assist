package br.com.navitasassist.controller;

import br.com.navitasassist.service.WorkflowService;
import br.com.navitasassist.workflow.WorkflowDocument.*;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/workflows")
@RequiredArgsConstructor
public class WorkflowController {
    private final WorkflowService service;

    @GetMapping
    public Published published() {
        return service.published();
    }

    @GetMapping("/draft")
    @PreAuthorize("hasRole('ADMIN')")
    public Draft draft() {
        return service.draft();
    }

    @PostMapping("/draft")
    @PreAuthorize("hasRole('ADMIN')")
    public Draft start() {
        return service.startDraft();
    }

    @PutMapping("/draft")
    @PreAuthorize("hasRole('ADMIN')")
    public Draft save(@Valid @RequestBody SaveDraft request) {
        return service.saveDraft(request);
    }

    @DeleteMapping("/draft")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasRole('ADMIN')")
    public void discard(@RequestParam long revision) {
        service.discard(revision);
    }

    @PostMapping("/publish")
    @PreAuthorize("hasRole('ADMIN')")
    public Published publish(@Valid @RequestBody PublishRequest request) {
        return service.publish(request);
    }
}
