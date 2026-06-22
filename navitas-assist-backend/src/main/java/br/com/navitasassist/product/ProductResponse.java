package br.com.navitasassist.product;

import java.time.Instant;

public record ProductResponse(
    Long id,
    String sku,
    String name,
    String category,
    String hardwareVersion,
    String firmwareVersion,
    Integer defaultWarrantyMonths,
    String technicalNotes,
    Instant createdAt,
    Instant updatedAt
) {
    public static ProductResponse from(Product product) {
        return new ProductResponse(
            product.getId(),
            product.getSku(),
            product.getName(),
            product.getCategory(),
            product.getHardwareVersion(),
            product.getFirmwareVersion(),
            product.getDefaultWarrantyMonths(),
            product.getTechnicalNotes(),
            product.getCreatedAt(),
            product.getUpdatedAt()
        );
    }
}
