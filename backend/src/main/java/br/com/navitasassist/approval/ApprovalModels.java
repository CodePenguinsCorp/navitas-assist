package br.com.navitasassist.approval;

import jakarta.validation.constraints.*;

import java.time.Instant;

public final class ApprovalModels {
    private ApprovalModels() {}

    public enum Status {
        PENDING,
        APPROVED,
        REJECTED
    }

    public record Approval(
            long id,
            String code,
            String justification,
            Status status,
            String requestedBy,
            Instant requestedAt,
            String decidedBy,
            Instant decidedAt,
            String decisionNote,
            long revision) {}

    public record Request(
            @NotBlank @Pattern(regexp = "[A-Z][A-Z0-9_]{0,59}") String code,
            @NotBlank @Size(max = 1000) String justification) {}

    public record DecisionRequest(
            @NotNull Status status,
            @NotBlank @Size(max = 255) String note,
            @NotNull Long expectedRevision) {}
}
