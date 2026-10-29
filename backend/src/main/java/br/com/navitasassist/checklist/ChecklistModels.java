package br.com.navitasassist.checklist;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.time.Instant;
import java.util.List;

public final class ChecklistModels {
    private ChecklistModels() {}

    public record ItemDefinition(
            @NotBlank @Pattern(regexp = "[A-Z][A-Z0-9_]{0,59}") String code,
            @NotBlank @Size(max = 120) String label,
            boolean required) {}

    public record TemplateRequest(
            @NotBlank @Pattern(regexp = "[A-Z][A-Z0-9_]{0,59}") String code,
            @NotBlank @Size(max = 120) String name,
            @NotEmpty @Size(max = 100) List<@NotNull @Valid ItemDefinition> items,
            boolean active,
            Long expectedVersion) {}

    public record Template(
            long id,
            String code,
            String name,
            List<ItemDefinition> items,
            boolean active,
            long version) {}

    public record Item(
            String code,
            String label,
            boolean required,
            boolean checked,
            String note,
            String updatedBy,
            Instant updatedAt) {}

    public record AuditEvent(
            String itemCode, Boolean checked, String note, String actor, Instant at) {}

    public record Execution(
            long id,
            String templateCode,
            String templateName,
            long templateVersion,
            List<Item> items,
            boolean completed,
            long revision,
            List<AuditEvent> history) {}

    public record StartRequest(@NotNull Long templateId) {}

    public record ItemUpdateRequest(
            @NotNull Boolean checked,
            @NotBlank @Size(max = 255) String note,
            @NotNull Long expectedRevision) {}
}
