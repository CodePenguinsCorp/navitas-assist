package br.com.navitasassist.client;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record ClientRequest(
        @NotBlank @Pattern(regexp = "(?U)^(?:[\\s\\p{Pd}]*[^\\s\\p{Pd}]){0,120}[\\s\\p{Pd}]*$", message = "deve ter no máximo 120 caracteres, sem contar espaços e hifens") String legalName,
        @Size(max = 120) String tradeName,
        @Size(max = 18) String documentNumber,
        @Email @Size(max = 120) String email,
        @Size(max = 30) String phone,
        @Size(max = 255) String address,
        @Size(max = 1000) String notes) {
}
