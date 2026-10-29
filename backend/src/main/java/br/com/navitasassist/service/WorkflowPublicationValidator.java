package br.com.navitasassist.service;

import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.rma.RmaPriority;
import br.com.navitasassist.rma.RmaStatus;
import br.com.navitasassist.user.UserRole;
import br.com.navitasassist.workflow.WorkflowDocument.*;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Service;

import java.util.*;

@Service
@RequiredArgsConstructor
public class WorkflowPublicationValidator {
    public static final Set<String> FIELDS =
            Set.of(
                    "invoiceNumber",
                    "reportedFailure",
                    "receivedAccessories",
                    "physicalCondition",
                    "repairSummary",
                    "replacedPartsSummary",
                    "testSummary",
                    "assigneeId",
                    "diagnosis.foundFailure",
                    "diagnosis.technicianName",
                    "trackingCode",
                    "carrier",
                    "shippedAt",
                    "purchaseDate",
                    "priority");
    private static final Set<RmaStatus> ACTIVE_STAGES =
            Set.of(
                    RmaStatus.RECEIVED,
                    RmaStatus.TRIAGE,
                    RmaStatus.IN_DIAGNOSIS,
                    RmaStatus.WAITING_PART,
                    RmaStatus.IN_REPAIR,
                    RmaStatus.IN_TESTS);
    private final RmaRecordRepository rmas;
    private final RmaOperationsService operations;

    public void validate(Definition definition, Definition previous) {
        require(
                definition.name() != null && !definition.name().isBlank(),
                "Workflow name is required.");
        require(!definition.statuses().isEmpty(), "At least one workflow status is required.");
        Map<String, Status> statuses = new HashMap<>();
        Set<String> labels = new HashSet<>();
        for (Status status : definition.statuses()) {
            require(
                    status.code() != null && status.code().matches("[A-Z][A-Z0-9_]{0,59}"),
                    "Invalid workflow status code.");
            require(
                    status.label() != null && !status.label().isBlank(),
                    "Workflow status label is required.");
            require(
                    statuses.put(status.code(), status) == null,
                    "Workflow status codes must be unique.");
            require(
                    labels.add(status.label().trim().toLowerCase(Locale.ROOT)),
                    "Workflow status labels must be unique.");
            require(status.category() != null, "Workflow status category is required.");
            require(
                    status.category() == Category.DONE
                            ? status.slaStage() == null
                            : (status.slaStage() != null
                                    && ACTIVE_STAGES.contains(status.slaStage())),
                    "Nonterminal statuses require an active SLA stage; DONE statuses have none.");
        }
        Status initial = statuses.get(definition.initialStatus());
        require(
                initial != null && initial.active() && initial.category() != Category.DONE,
                "Initial status must be active and nonterminal.");
        for (Status old : previous.statuses())
            if (!statuses.containsKey(old.code()))
                require(
                        !rmas.existsByStatus(old.code()),
                        "Cannot delete a workflow status used by an RMA: " + old.code());
        Set<String> edges = new HashSet<>();
        for (Transition transition : definition.transitions()) {
            require(
                    statuses.containsKey(transition.from())
                            && statuses.containsKey(transition.to()),
                    "Transition status does not exist.");
            require(!transition.from().equals(transition.to()), "A transition must change status.");
            require(statuses.get(transition.to()).active(), "Transition destination is archived.");
            require(
                    edges.add(transition.from() + ":" + transition.to()),
                    "Duplicate workflow transition.");
            require(
                    !transition.roles().isEmpty() && !transition.roles().contains(UserRole.VIEWER),
                    "Transition roles must allow an operator and cannot include VIEWER.");
            require(
                    new HashSet<>(transition.roles()).size() == transition.roles().size(),
                    "Transition roles must be unique.");
            require(
                    FIELDS.containsAll(transition.requiredFields()),
                    "Unknown required workflow field.");
            for (Condition condition : transition.conditions())
                validateCondition(condition, statuses);
            validateContradictions(transition);
            for (Action action : transition.actions())
                switch (action.type()) {
                    case ADD_NOTE ->
                            require(
                                    action.value() != null && !action.value().isBlank(),
                                    "ADD_NOTE requires a note.");
                    case SET_PRIORITY ->
                            require(
                                    Arrays.stream(RmaPriority.values())
                                            .anyMatch(p -> p.name().equals(action.value())),
                                    "Invalid action priority.");
                    case CLEAR_ASSIGNEE ->
                            require(
                                    action.value() == null || action.value().isBlank(),
                                    "CLEAR_ASSIGNEE cannot have a value.");
                }
        }
        Set<String> reachable = new HashSet<>();
        for (Status s : statuses.values())
            if (s.active() && s.category() == Category.DONE) reachable.add(s.code());
        boolean changed;
        do {
            changed = false;
            for (Transition t : definition.transitions())
                if (reachable.contains(t.to())) changed |= reachable.add(t.from());
        } while (changed);
        for (Status s : statuses.values())
            if (s.category() != Category.DONE && (s.active() || rmas.existsByStatus(s.code())))
                require(
                        reachable.contains(s.code()),
                        "Active or in-use nonterminal status cannot reach DONE: " + s.code());
    }

    private void validateCondition(Condition condition, Map<String, Status> statuses) {
        require(
                condition.type() != null && condition.operator() != null,
                "Condition type and operator are required.");
        switch (condition.type()) {
            case FIELD -> {
                require(
                        condition.field() != null && FIELDS.contains(condition.field()),
                        "Unknown workflow condition field.");
                if (condition.operator() != Operator.PRESENT)
                    require(condition.value() != null, "Field comparison value is required.");
            }
            case CHECKLIST, APPROVAL -> {
                require(
                        condition.field() != null
                                && condition.field().matches("[A-Z][A-Z0-9_]{0,59}"),
                        "Condition evidence code is required.");
                require(
                        condition.operator() != Operator.PRESENT
                                && ("true".equals(condition.value())
                                        || "false".equals(condition.value())),
                        "Evidence conditions require a boolean equality comparison.");
                if (condition.type() == ConditionType.CHECKLIST)
                    require(
                            operations.activeTemplateExists(condition.field()),
                            "Checklist template does not exist or is archived: "
                                    + condition.field());
            }
            case RELATED_STATUS ->
                    require(
                            condition.operator() != Operator.PRESENT
                                    && statuses.containsKey(condition.value()),
                            "Related status condition requires an existing status comparison.");
        }
    }

    private void validateContradictions(Transition transition) {
        Map<String, String> equals = new HashMap<>();
        Map<String, Set<String>> notEquals = new HashMap<>();
        Set<String> present = new HashSet<>();
        for (String field : transition.requiredFields()) present.add("FIELD:" + field);
        for (Condition c : transition.conditions()) {
            String key =
                    c.type() + ":" + (c.type() == ConditionType.RELATED_STATUS ? "" : c.field());
            if (c.operator() == Operator.PRESENT) present.add(key);
            else if (c.operator() == Operator.EQUALS) {
                String before = equals.put(key, c.value());
                require(
                        before == null || before.equals(c.value()),
                        "Contradictory workflow equality conditions.");
            } else notEquals.computeIfAbsent(key, k -> new HashSet<>()).add(c.value());
        }
        for (var e : equals.entrySet()) {
            require(
                    !notEquals.getOrDefault(e.getKey(), Set.of()).contains(e.getValue()),
                    "Contradictory workflow conditions.");
            require(
                    !present.contains(e.getKey()) || !e.getValue().isBlank(),
                    "Required workflow field cannot equal an empty value.");
        }
        for (var e : notEquals.entrySet())
            if (e.getKey().startsWith("CHECKLIST:") || e.getKey().startsWith("APPROVAL:"))
                require(
                        !(e.getValue().contains("true") && e.getValue().contains("false")),
                        "Contradictory evidence conditions.");
    }

    private void require(boolean condition, String message) {
        if (!condition) throw new BusinessException(message);
    }
}
