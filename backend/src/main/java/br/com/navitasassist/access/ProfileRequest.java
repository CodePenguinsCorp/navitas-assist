package br.com.navitasassist.access;

import java.util.Set;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Nome (aparado, 1 a 60 caracteres) e códigos do catálogo. */
public record ProfileRequest(
    @NotBlank @Size(max = 60) String name,
    @NotNull Set<@NotBlank String> permissions
) {
}
