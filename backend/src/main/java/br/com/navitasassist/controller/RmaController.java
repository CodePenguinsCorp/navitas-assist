package br.com.navitasassist.controller;

import java.util.List;

import br.com.navitasassist.diagnosis.DiagnosisRequest;
import br.com.navitasassist.pagination.PageResponse;
import br.com.navitasassist.rma.CreateRmaRequest;
import br.com.navitasassist.rma.RmaAssigneeUpdateRequest;
import br.com.navitasassist.rma.RmaBlockRequest;
import br.com.navitasassist.rma.RmaBlockResolveRequest;
import br.com.navitasassist.rma.RmaResponse;
import br.com.navitasassist.rma.RmaItemWarrantyRequest;
import br.com.navitasassist.rma.RmaStatus;
import br.com.navitasassist.rma.RmaStatusUpdateRequest;
import br.com.navitasassist.rma.RmaSummaryResponse;
import br.com.navitasassist.rma.UpdateRmaRequest;
import br.com.navitasassist.service.RmaService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/rmas")
@RequiredArgsConstructor
public class RmaController {

    private final RmaService rmaService;

    @GetMapping
    public PageResponse<RmaResponse> searchPage(
        @RequestParam(required = false) @jakarta.validation.constraints.Size(max = 100, message = "A busca deve ter no máximo 100 caracteres.") String query,
        @RequestParam(required = false) RmaStatus status,
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer size
    ) {
        return rmaService.searchPage(query, status, page, size);
    }

    @GetMapping("/summary")
    public RmaSummaryResponse summarize(
        @RequestParam(required = false) @jakarta.validation.constraints.Size(max = 100, message = "A busca deve ter no máximo 100 caracteres.") String query,
        @RequestParam(required = false) RmaStatus status
    ) {
        return rmaService.summarize(query, status);
    }

    @GetMapping("/board")
    public List<RmaResponse> search(
        @RequestParam(required = false) @jakarta.validation.constraints.Size(max = 100, message = "A busca deve ter no máximo 100 caracteres.") String query,
        @RequestParam(required = false) RmaStatus status
    ) {
        return rmaService.search(query, status);
    }

    @GetMapping("/{id}")
    public RmaResponse getById(@PathVariable Long id) {
        return rmaService.getById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public RmaResponse create(@Valid @RequestBody CreateRmaRequest request) {
        return rmaService.create(request);
    }

    @PutMapping("/{id}")
    public RmaResponse update(@PathVariable Long id, @Valid @RequestBody UpdateRmaRequest request) {
        return rmaService.update(id, request);
    }

    @PatchMapping("/{id}/status-history/{eventId}/note")
    public RmaResponse updateStatusNote(@PathVariable Long id, @PathVariable Long eventId, @RequestBody br.com.navitasassist.rma.RmaStatusNoteRequest request) {
        return rmaService.updateStatusNote(id, eventId, request);
    }

    @PatchMapping("/{id}/status")
    public RmaResponse updateStatus(@PathVariable Long id, @Valid @RequestBody RmaStatusUpdateRequest request) {
        return rmaService.updateStatus(id, request);
    }

    @PutMapping("/{id}/items/{itemId}/warranty")
    public RmaResponse updateWarranty(@PathVariable Long id, @PathVariable Long itemId, @RequestBody RmaItemWarrantyRequest request) {
        return rmaService.updateWarranty(id, itemId, request);
    }

    @PatchMapping("/{id}/assignee")
    public RmaResponse updateAssignee(@PathVariable Long id, @RequestBody RmaAssigneeUpdateRequest request) {
        return rmaService.updateAssignee(id, request);
    }

    @PutMapping("/{id}/diagnosis")
    public RmaResponse upsertDiagnosis(@PathVariable Long id, @Valid @RequestBody DiagnosisRequest request) {
        return rmaService.upsertDiagnosis(id, request);
    }

    @PostMapping("/{id}/blocks")
    public RmaResponse block(@PathVariable Long id, @Valid @RequestBody RmaBlockRequest request) {
        return rmaService.block(id, request);
    }

    @PatchMapping("/{id}/blocks/{blockId}")
    public RmaResponse resolveBlock(@PathVariable Long id, @PathVariable Long blockId, @Valid @RequestBody RmaBlockResolveRequest request) {
        return rmaService.resolveBlock(id, blockId, request);
    }
}
