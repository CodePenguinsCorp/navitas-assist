package br.com.navitasassist.client;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ClientRequest(
    @NotBlank @Size(max = 120) String legalName,
    @Size(max = 120) String tradeName,
    @Size(max = 18) String documentNumber,
    @Size(max = 120) String contactName,
    @Email @Size(max = 120) String email,
    @Size(max = 30) String phone,
    @Size(max = 255) String address,
    @Size(max = 1000) String notes
) {
}
