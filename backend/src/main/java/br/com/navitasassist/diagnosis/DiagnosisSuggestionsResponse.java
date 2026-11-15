package br.com.navitasassist.diagnosis;

import java.util.List;

/** Distinct values already used in diagnoses, to suggest when typing the failure type and the probable cause. */
public record DiagnosisSuggestionsResponse(List<String> failureTypes, List<String> probableCauses) {
}
