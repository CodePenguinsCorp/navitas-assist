package br.com.navitasassist.rma;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RmaBlockResolveRequest(@NotBlank @Size(max = 1000) String resolutionNote) {
}
