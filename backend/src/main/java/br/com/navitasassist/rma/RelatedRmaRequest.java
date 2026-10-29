package br.com.navitasassist.rma;

import jakarta.validation.constraints.*;

import java.time.Instant;

public record RelatedRmaRequest(
        Long relatedRmaId, @NotBlank @Size(max = 255) String note, Instant expectedUpdatedAt) {}
