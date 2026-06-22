package br.com.navitasassist.diagnosis;

import java.time.Instant;
import java.time.LocalDate;

public record DiagnosisResponse(
    Long id,
    String foundFailure,
    FailureType failureType,
    FailureCause probableCause,
    String notes,
    LocalDate diagnosedAt,
    String technicianName,
    Instant createdAt,
    Instant updatedAt
) {
    public static DiagnosisResponse from(Diagnosis diagnosis) {
        if (diagnosis == null) {
            return null;
        }

        return new DiagnosisResponse(
            diagnosis.getId(),
            diagnosis.getFoundFailure(),
            diagnosis.getFailureType(),
            diagnosis.getProbableCause(),
            diagnosis.getNotes(),
            diagnosis.getDiagnosedAt(),
            diagnosis.getTechnicianName(),
            diagnosis.getCreatedAt(),
            diagnosis.getUpdatedAt()
        );
    }
}
