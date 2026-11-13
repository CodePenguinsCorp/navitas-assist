package br.com.navitasassist.rma;

import java.time.LocalDate;
import jakarta.validation.constraints.Positive;
import org.springframework.format.annotation.DateTimeFormat;

/** Report filters shared by the list, the summary and the CSV exports; page and size only apply to the list. */
public record RmaReportRequest(
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate entryFrom,
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate entryTo,
    RmaStatus status,
    @Positive Long clientId,
    Integer page,
    Integer size
) {}
