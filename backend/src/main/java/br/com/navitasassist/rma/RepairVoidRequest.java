package br.com.navitasassist.rma;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RepairVoidRequest(@NotBlank @Size(max = 1000) String reason) {}
