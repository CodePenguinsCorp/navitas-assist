package br.com.navitasassist.rma;

import java.math.BigDecimal;
import java.util.List;

public record RmaRepairResponse(List<InterventionResponse> interventions, BigDecimal totalServiceHours) {}
