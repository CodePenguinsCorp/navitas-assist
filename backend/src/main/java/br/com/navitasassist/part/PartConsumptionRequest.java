package br.com.navitasassist.part;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PartConsumptionRequest(
    @NotBlank @Size(max = 1000) String replacementReason,
    @Size(max = 120) String componentBatch
) {}
