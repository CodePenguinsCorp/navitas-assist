package br.com.navitasassist.user;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record UserAccountUpdateRequest(
    @NotBlank @Size(max = 30) String username,
    @NotBlank @Size(max = 60) String fullName,
    @Size(min = 6, max = 120) String password,
    @NotNull UserRole role,
    boolean active
) {
}
