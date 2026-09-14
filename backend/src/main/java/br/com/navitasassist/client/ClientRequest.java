package br.com.navitasassist.client;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record ClientRequest(
        @NotBlank @Pattern(regexp = "(?U)^(?:[\\s\\p{Pd}]*[^\\s\\p{Pd}]){0,120}[\\s\\p{Pd}]*$", message = "must contain at most 120 characters excluding spaces and dashes") String legalName,
        @Size(max = 120) String tradeName,
        @Size(max = 18) String documentNumber,
        @Size(max = 120) String contactName,
        @Email @Size(max = 120) String email,
        @Size(max = 30) String phone,
        @Size(max = 255) String address,
        @Size(max = 1000) String notes) {
}
