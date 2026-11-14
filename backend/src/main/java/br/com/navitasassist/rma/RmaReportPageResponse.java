package br.com.navitasassist.rma;

import java.time.Instant;
import java.time.LocalDate;

import br.com.navitasassist.pagination.PageResponse;

public record RmaReportPageResponse(Instant generatedAt, LocalDate entryFrom, LocalDate entryTo, PageResponse<RmaReportRowResponse> rmas) {}
