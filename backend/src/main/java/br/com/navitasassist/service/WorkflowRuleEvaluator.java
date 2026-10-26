package br.com.navitasassist.service;

import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.workflow.WorkflowDocument.*;

import lombok.RequiredArgsConstructor;

import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
@RequiredArgsConstructor
public class WorkflowRuleEvaluator {
    private final RmaOperationsService operations;
    private final RmaRecordRepository rmas;

    public List<TransitionOption> options(RmaRecord rma, Published workflow) {
        return workflow.definition().transitions().stream()
                .filter(t -> t.from().equals(rma.getStatus()))
                .map(
                        t -> {
                            String reason = reason(rma, t, workflow);
                            return new TransitionOption(
                                    t.to(),
                                    WorkflowService.status(workflow, t.to()).label(),
                                    reason == null,
                                    reason);
                        })
                .toList();
    }

    public Transition validate(RmaRecord rma, String destination, Published workflow) {
        Transition transition =
                workflow.definition().transitions().stream()
                        .filter(t -> t.from().equals(rma.getStatus()) && t.to().equals(destination))
                        .findFirst()
                        .orElseThrow(
                                () ->
                                        new BusinessException(
                                                "Workflow transition is not configured."));
        String reason = reason(rma, transition, workflow);
        if ("Your role cannot perform this transition.".equals(reason))
            throw new org.springframework.security.access.AccessDeniedException(reason);
        if (reason != null) throw new BusinessException(reason);
        return transition;
    }

    private String reason(RmaRecord rma, Transition transition, Published workflow) {
        if (!WorkflowService.status(workflow, transition.to()).active())
            return "Destination status is archived.";
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null
                || transition.roles().stream()
                        .noneMatch(
                                role ->
                                        authentication.getAuthorities().stream()
                                                .anyMatch(
                                                        a ->
                                                                a.getAuthority()
                                                                        .equals(
                                                                                "ROLE_"
                                                                                        + role
                                                                                                .name()))))
            return "Your role cannot perform this transition.";
        for (String field : transition.requiredFields())
            if (field(rma, field).isBlank()) return "Required field: " + field;
        for (Condition c : transition.conditions()) {
            String actual =
                    switch (c.type()) {
                        case FIELD -> field(rma, c.field());
                        case CHECKLIST ->
                                Boolean.toString(
                                        rma.getId() != null
                                                && operations.checklistCompleted(
                                                        rma.getId(), c.field()));
                        case APPROVAL ->
                                Boolean.toString(
                                        rma.getId() != null
                                                && operations.approved(rma.getId(), c.field()));
                        case RELATED_STATUS ->
                                rma.getRelatedRmaId() == null
                                        ? ""
                                        : rmas.findById(rma.getRelatedRmaId())
                                                .map(RmaRecord::getStatus)
                                                .orElse("");
                    };
            boolean valid =
                    switch (c.operator()) {
                        case PRESENT -> !actual.isBlank();
                        case EQUALS -> Objects.equals(actual, c.value());
                        case NOT_EQUALS -> !Objects.equals(actual, c.value());
                    };
            if (!valid)
                return "Workflow condition not met: "
                        + c.type()
                        + " "
                        + (c.field() == null ? "" : c.field());
        }
        return null;
    }

    private String field(RmaRecord r, String name) {
        Object value =
                switch (name) {
                    case "invoiceNumber" -> r.getInvoiceNumber();
                    case "reportedFailure" -> r.getReportedFailure();
                    case "receivedAccessories" -> r.getReceivedAccessories();
                    case "physicalCondition" -> r.getPhysicalCondition();
                    case "repairSummary" -> r.getRepairSummary();
                    case "replacedPartsSummary" -> r.getReplacedPartsSummary();
                    case "testSummary" -> r.getTestSummary();
                    case "assigneeId" -> r.getAssignee() == null ? null : r.getAssignee().getId();
                    case "diagnosis.foundFailure" ->
                            r.getDiagnosis() == null ? null : r.getDiagnosis().getFoundFailure();
                    case "diagnosis.technicianName" ->
                            r.getDiagnosis() == null ? null : r.getDiagnosis().getTechnicianName();
                    case "trackingCode" -> r.getTrackingCode();
                    case "carrier" -> r.getCarrier();
                    case "shippedAt" -> r.getShippedAt();
                    case "purchaseDate" -> r.getPurchaseDate();
                    case "priority" -> r.getPriority();
                    default -> throw new BusinessException("Unknown workflow field: " + name);
                };
        return value == null ? "" : value.toString().trim();
    }
}
