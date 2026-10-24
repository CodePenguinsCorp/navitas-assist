package br.com.navitasassist.protocol;

import java.util.List;
import java.util.Set;

import br.com.navitasassist.rma.RmaStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ProtocolTemplateRequest(
    @NotBlank @Size(max = 120) String name,
    Long productId,
    @Size(max = 80) String category,
    @NotNull Boolean active,
    Set<RmaStatus> blockedStatuses,
    @NotEmpty @Size(max = 100) List<@NotNull @Valid ProtocolTemplateItemRequest> items
) {
}
