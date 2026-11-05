package br.com.navitasassist.rma;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public record RmaReportResponse(Instant generatedAt, LocalDate entryFrom, LocalDate entryTo, List<RmaResponse> rmas) {}
