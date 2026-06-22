package br.com.navitasassist.diagnosis;

import java.time.LocalDate;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record DiagnosisRequest(
    @NotBlank @Size(max = 2000) String foundFailure,
    FailureType failureType,
    FailureCause probableCause,
    @Size(max = 2000) String notes,
    @NotNull LocalDate diagnosedAt,
    @NotBlank @Size(max = 120) String technicianName
) {
}
