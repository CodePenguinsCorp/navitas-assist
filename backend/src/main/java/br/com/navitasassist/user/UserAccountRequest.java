package br.com.navitasassist.user;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record UserAccountRequest(
    @NotBlank @Size(max = 60) String username,
    @NotBlank @Size(max = 120) String fullName,
    @NotBlank @Size(min = 6, max = 120) String password,
    @NotNull UserRole role,
    boolean active
) {
}
