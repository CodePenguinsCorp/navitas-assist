package br.com.navitasassist.controller;

import br.com.navitasassist.approval.ApprovalModels;
import br.com.navitasassist.checklist.ChecklistModels.*;
import br.com.navitasassist.service.RmaOperationsService;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/rmas/{rmaId}")
@RequiredArgsConstructor
public class RmaOperationsController {
    private final RmaOperationsService service;

    @GetMapping("/checklists")
    public List<Execution> checklists(@PathVariable long rmaId) {
        return service.checklists(rmaId);
    }

    @PostMapping("/checklists")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('ADMIN','SERVICE_DESK','TECHNICIAN')")
    public Execution start(@PathVariable long rmaId, @Valid @RequestBody StartRequest request) {
        return service.startChecklist(rmaId, request);
    }

    @PatchMapping("/checklists/{executionId}/items/{itemCode}")
    @PreAuthorize("hasAnyRole('ADMIN','SERVICE_DESK','TECHNICIAN')")
    public Execution item(
            @PathVariable long rmaId,
            @PathVariable long executionId,
            @PathVariable String itemCode,
            @Valid @RequestBody ItemUpdateRequest request) {
        return service.updateItem(rmaId, executionId, itemCode, request);
    }

    @GetMapping("/approvals")
    public List<ApprovalModels.Approval> approvals(@PathVariable long rmaId) {
        return service.approvals(rmaId);
    }

    @PostMapping("/approvals")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('ADMIN','SERVICE_DESK','TECHNICIAN')")
    public ApprovalModels.Approval request(
            @PathVariable long rmaId, @Valid @RequestBody ApprovalModels.Request request) {
        return service.requestApproval(rmaId, request);
    }

    @PatchMapping("/approvals/{approvalId}")
    @PreAuthorize("hasAnyRole('ADMIN','SERVICE_DESK')")
    public ApprovalModels.Approval decide(
            @PathVariable long rmaId,
            @PathVariable long approvalId,
            @Valid @RequestBody ApprovalModels.DecisionRequest request) {
        return service.decide(rmaId, approvalId, request);
    }
}
