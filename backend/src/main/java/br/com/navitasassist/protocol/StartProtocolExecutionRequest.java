package br.com.navitasassist.protocol;

import jakarta.validation.constraints.NotNull;

public record StartProtocolExecutionRequest(
    @NotNull Long templateId
) {
}
