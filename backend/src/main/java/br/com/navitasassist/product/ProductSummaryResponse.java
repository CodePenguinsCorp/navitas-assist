package br.com.navitasassist.product;

import java.util.List;

public record ProductSummaryResponse(long total, List<String> categories) {}
