package br.com.navitasassist.part;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PartReversalRequest(
    @NotBlank @Size(max = 255) String reason
) {
}
