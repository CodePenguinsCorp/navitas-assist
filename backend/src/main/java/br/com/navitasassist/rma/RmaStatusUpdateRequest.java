package br.com.navitasassist.rma;

import jakarta.validation.constraints.*;

public record RmaStatusUpdateRequest(
        @NotBlank @Size(max = 60) String status,
        @Size(max = 255) String note,
        @Size(max = 60) String expectedStatus,
        Long expectedWorkflowVersion) {}
