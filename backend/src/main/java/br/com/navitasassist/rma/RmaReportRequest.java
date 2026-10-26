package br.com.navitasassist.rma;

import java.time.LocalDate;
import jakarta.validation.constraints.Positive;
import org.springframework.format.annotation.DateTimeFormat;

public record RmaReportRequest(
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate entryFrom,
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate entryTo,
    RmaStatus status,
    @Positive Long clientId
) {}
