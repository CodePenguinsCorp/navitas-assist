package br.com.navitasassist.workflow;

import br.com.navitasassist.rma.RmaStatus;
import br.com.navitasassist.user.UserRole;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.util.List;

public final class WorkflowDocument {
    private WorkflowDocument() {}

    public enum Category {
        PENDING,
        IN_PROGRESS,
        DONE
    }

    public enum ConditionType {
        FIELD,
        CHECKLIST,
        APPROVAL,
        RELATED_STATUS
    }

    public enum Operator {
        PRESENT,
        EQUALS,
        NOT_EQUALS
    }

    public enum ActionType {
        ADD_NOTE,
        SET_PRIORITY,
        CLEAR_ASSIGNEE
    }

    public record Status(
            @NotNull @Size(max = 60) String code,
            @NotNull @Size(max = 120) String label,
            Category category,
            boolean active,
            RmaStatus slaStage) {}

    public record Condition(
            @NotNull ConditionType type,
            @Size(max = 120) String field,
            @NotNull Operator operator,
            @Size(max = 2000) String value) {}

    public record Action(@NotNull ActionType type, @Size(max = 255) String value) {}

    public record Transition(
            @NotBlank @Size(max = 60) String from,
            @NotBlank @Size(max = 60) String to,
            @NotNull @Size(max = 4) List<@NotNull UserRole> roles,
            @NotNull @Size(max = 30) List<@NotBlank @Size(max = 120) String> requiredFields,
            @NotNull @Size(max = 50) List<@NotNull @Valid Condition> conditions,
            @NotNull @Size(max = 20) List<@NotNull @Valid Action> actions) {}

    public record Definition(
            @NotNull @Size(max = 120) String name,
            @NotNull @Size(max = 60) String initialStatus,
            @NotNull @Size(max = 100) List<@NotNull @Valid Status> statuses,
            @NotNull @Size(max = 10000) List<@NotNull @Valid Transition> transitions) {}

    public record Published(long version, Definition definition) {}

    public record Draft(long publishedVersion, long revision, Definition definition) {}

    public record SaveDraft(
            @NotNull Long expectedRevision, @NotNull @Valid Definition definition) {}

    public record PublishRequest(@NotNull Long expectedRevision) {}

    public record TransitionOption(String status, String label, boolean allowed, String reason) {}
}
