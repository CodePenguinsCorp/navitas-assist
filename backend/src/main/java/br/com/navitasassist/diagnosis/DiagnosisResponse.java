package br.com.navitasassist.diagnosis;

import java.time.LocalDate;

public record DiagnosisResponse(
    String foundFailure,
    FailureType failureType,
    FailureCause probableCause,
    String notes,
    LocalDate diagnosedAt,
    String technicianName
) {
    public static DiagnosisResponse from(Diagnosis diagnosis) {
        if (diagnosis == null) {
            return null;
        }

        return new DiagnosisResponse(
            diagnosis.getFoundFailure(),
            diagnosis.getFailureType(),
            diagnosis.getProbableCause(),
            diagnosis.getNotes(),
            diagnosis.getDiagnosedAt(),
            diagnosis.getTechnicianName()
        );
    }
}
