package br.com.navitasassist.custody;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record StorageLocationRequest(
    @NotBlank @Size(max = 40) String code,
    @NotBlank @Size(max = 120) String name,
    @NotNull StorageLocationType type,
    Long parentId,
    @Size(max = 500) String description,
    @NotNull Boolean active
) {
}
