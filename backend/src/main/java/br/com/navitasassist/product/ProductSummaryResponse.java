package br.com.navitasassist.product;

import java.util.List;

public record ProductSummaryResponse(
    long total,
    long withFirmware,
    long averageWarrantyMonths,
    List<String> categories
) {
}
