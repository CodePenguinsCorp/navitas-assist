package br.com.navitasassist.service;

import br.com.navitasassist.approval.ApprovalModels;
import br.com.navitasassist.checklist.ChecklistModels.*;
import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.controller.ResourceNotFoundException;
import br.com.navitasassist.repository.RmaOperationsRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.repository.WorkflowRepository;
import br.com.navitasassist.workflow.WorkflowDocument;

import lombok.RequiredArgsConstructor;

import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;

@Service
@RequiredArgsConstructor
@Transactional
public class RmaOperationsService {
    private final RmaOperationsRepository repository;
    private final WorkflowRepository workflows;
    private final RmaRecordRepository rmas;

    @Transactional(readOnly = true)
    public List<Template> templates() {
        return repository.templates();
    }

    public Template createTemplate(TemplateRequest request) {
        workflows.published(true);
        validateTemplate(request);
        if (templateExists(request.code()))
            throw new BusinessException("Checklist template code already exists.");
        long id = repository.insertTemplate(request.code());
        return saveTemplate(
                new Template(
                        id,
                        request.code(),
                        request.name().trim(),
                        request.items(),
                        request.active(),
                        1));
    }

    public Template updateTemplate(long id, TemplateRequest request) {
        var workflow = workflows.published(true);
        validateTemplate(request);
        Template old =
                repository
                        .templateForUpdate(id)
                        .orElseThrow(
                                () ->
                                        new ResourceNotFoundException(
                                                "Checklist template not found: " + id));
        if (!old.code().equals(request.code()))
            throw new BusinessException("Checklist template code is immutable.");
        if (request.expectedVersion() == null || request.expectedVersion() != old.version())
            throw new BusinessException("Checklist template changed. Refresh before trying again.");
        if (!request.active()
                && workflow.definition().transitions().stream()
                        .flatMap(transition -> transition.conditions().stream())
                        .anyMatch(
                                condition ->
                                        condition.type() == WorkflowDocument.ConditionType.CHECKLIST
                                                && old.code().equals(condition.field()))) {
            throw new BusinessException(
                    "Cannot archive a checklist template referenced by the published workflow.");
        }
        return saveTemplate(
                new Template(
                        id,
                        old.code(),
                        request.name().trim(),
                        request.items(),
                        request.active(),
                        old.version() + 1));
    }

    @Transactional(readOnly = true)
    public boolean templateExists(String code) {
        return repository.templateExists(code);
    }

    @Transactional(readOnly = true)
    public boolean activeTemplateExists(String code) {
        return repository.templates().stream()
                .anyMatch(template -> template.code().equals(code) && template.active());
    }

    private void validateTemplate(TemplateRequest request) {
        if (request.items().stream().noneMatch(ItemDefinition::required))
            throw new BusinessException("At least one required checklist item is needed.");
        if (request.items().stream().map(ItemDefinition::code).distinct().count()
                != request.items().size())
            throw new BusinessException("Checklist item codes must be unique.");
    }

    private Template saveTemplate(Template value) {
        repository.saveTemplate(value);
        return value;
    }

    @Transactional(readOnly = true)
    public List<Execution> checklists(long rmaId) {
        exists(rmaId);
        return repository.checklists(rmaId);
    }

    public Execution startChecklist(long rmaId, StartRequest request) {
        lock(rmaId);
        Template t =
                templates().stream()
                        .filter(x -> x.id() == request.templateId())
                        .findFirst()
                        .orElseThrow(
                                () ->
                                        new ResourceNotFoundException(
                                                "Checklist template not found: "
                                                        + request.templateId()));
        if (!t.active()) throw new BusinessException("Checklist template is archived.");
        long id = repository.insertChecklist(rmaId, t.code());
        Execution result =
                new Execution(
                        id,
                        t.code(),
                        t.name(),
                        t.version(),
                        t.items().stream()
                                .map(
                                        i ->
                                                new Item(
                                                        i.code(),
                                                        i.label(),
                                                        i.required(),
                                                        false,
                                                        null,
                                                        null,
                                                        null))
                                .toList(),
                        false,
                        1,
                        List.of(
                                new AuditEvent(
                                        null, null, "Checklist started", actor(), Instant.now())));
        saveExecution(result);
        return result;
    }

    public Execution updateItem(
            long rmaId, long executionId, String itemCode, ItemUpdateRequest request) {
        lock(rmaId);
        Execution old =
                checklists(rmaId).stream()
                        .filter(x -> x.id() == executionId)
                        .findFirst()
                        .orElseThrow(
                                () ->
                                        new ResourceNotFoundException(
                                                "Checklist execution not found: " + executionId));
        if (old.revision() != request.expectedRevision())
            throw new BusinessException(
                    "Checklist execution changed. Refresh before trying again.");
        if (old.items().stream().noneMatch(i -> i.code().equals(itemCode)))
            throw new ResourceNotFoundException("Checklist item not found: " + itemCode);
        Instant now = Instant.now();
        String actor = actor();
        List<Item> items =
                old.items().stream()
                        .map(
                                i ->
                                        i.code().equals(itemCode)
                                                ? new Item(
                                                        i.code(),
                                                        i.label(),
                                                        i.required(),
                                                        request.checked(),
                                                        request.note().trim(),
                                                        actor,
                                                        now)
                                                : i)
                        .toList();
        List<AuditEvent> history = new ArrayList<>(old.history());
        history.add(new AuditEvent(itemCode, request.checked(), request.note().trim(), actor, now));
        Execution result =
                new Execution(
                        old.id(),
                        old.templateCode(),
                        old.templateName(),
                        old.templateVersion(),
                        items,
                        items.stream().filter(Item::required).allMatch(Item::checked),
                        old.revision() + 1,
                        List.copyOf(history));
        saveExecution(result);
        return result;
    }

    private void saveExecution(Execution execution) {
        repository.saveExecution(execution);
    }

    @Transactional(readOnly = true)
    public List<ApprovalModels.Approval> approvals(long rmaId) {
        exists(rmaId);
        return repository.approvals(rmaId);
    }

    public ApprovalModels.Approval requestApproval(long rmaId, ApprovalModels.Request request) {
        lock(rmaId);
        long id = repository.insertApproval(rmaId, request.code());
        var result =
                new ApprovalModels.Approval(
                        id,
                        request.code(),
                        request.justification().trim(),
                        ApprovalModels.Status.PENDING,
                        actor(),
                        Instant.now(),
                        null,
                        null,
                        null,
                        1);
        saveApproval(result);
        return result;
    }

    public ApprovalModels.Approval decide(
            long rmaId, long approvalId, ApprovalModels.DecisionRequest request) {
        lock(rmaId);
        List<ApprovalModels.Approval> all = approvals(rmaId);
        var old =
                all.stream()
                        .filter(a -> a.id() == approvalId)
                        .findFirst()
                        .orElseThrow(
                                () ->
                                        new ResourceNotFoundException(
                                                "Approval not found: " + approvalId));
        if (old.revision() != request.expectedRevision()
                || old.status() != ApprovalModels.Status.PENDING
                || all.stream().anyMatch(a -> a.code().equals(old.code()) && a.id() > old.id()))
            throw new BusinessException(
                    "Approval changed, decided or superseded. Refresh before trying again.");
        if (request.status() == ApprovalModels.Status.PENDING)
            throw new BusinessException("A final approval decision is required.");
        var result =
                new ApprovalModels.Approval(
                        old.id(),
                        old.code(),
                        old.justification(),
                        request.status(),
                        old.requestedBy(),
                        old.requestedAt(),
                        actor(),
                        Instant.now(),
                        request.note().trim(),
                        old.revision() + 1);
        saveApproval(result);
        return result;
    }

    private void saveApproval(ApprovalModels.Approval approval) {
        repository.saveApproval(approval);
    }

    @Transactional(readOnly = true)
    public boolean checklistCompleted(long rmaId, String code) {
        return repository.latestChecklist(rmaId, code).map(Execution::completed).orElse(false);
    }

    @Transactional(readOnly = true)
    public boolean approved(long rmaId, String code) {
        return repository
                .latestApproval(rmaId, code)
                .map(a -> a.status() == ApprovalModels.Status.APPROVED)
                .orElse(false);
    }

    private void exists(long id) {
        if (!rmas.existsById(id)) throw new ResourceNotFoundException("RMA not found: " + id);
    }

    private void lock(long id) {
        rmas.findByIdForUpdate(id)
                .orElseThrow(() -> new ResourceNotFoundException("RMA not found: " + id));
    }

    private String actor() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }
}
