package br.com.navitasassist.rma;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RmaBlockRequest(@NotBlank @Size(max = 1000) String reason, @Size(max = 80) String category) {
}
