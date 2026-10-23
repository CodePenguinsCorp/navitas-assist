package br.com.navitasassist.rma;

import java.time.Instant;
import java.util.List;

public record RmaReportResponse(Instant generatedAt, List<RmaResponse> rmas) {}
