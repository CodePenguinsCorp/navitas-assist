package br.com.navitasassist.diagnosis;

import java.time.LocalDate;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record DiagnosisRequest(
    @NotBlank @Size(max = 2000) String foundFailure,
    @Size(max = 80) String failureType,
    @Size(max = 80) String probableCause,
    @Size(max = 2000) String notes,
    @NotNull LocalDate diagnosedAt,
    @NotBlank @Size(max = 120) String technicianName
) {
}
