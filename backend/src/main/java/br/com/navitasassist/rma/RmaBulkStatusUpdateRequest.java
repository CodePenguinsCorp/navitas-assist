package br.com.navitasassist.rma;

import jakarta.validation.constraints.*;

public record RmaBulkStatusUpdateRequest(
        @NotBlank @Size(max = 60) String status,
        @NotBlank @Size(max = 60) String expectedStatus,
        @Size(max = 255) String note,
        Long expectedWorkflowVersion) {}
