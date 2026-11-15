package br.com.navitasassist.rma;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public record RmaBoardPositionRequest(
    @NotNull(message = "Informe o status da coluna.") RmaStatus status,
    @Positive(message = "O predecessor deve ter um identificador positivo.") Long afterId,
    @Positive(message = "O sucessor deve ter um identificador positivo.") Long beforeId) {}
