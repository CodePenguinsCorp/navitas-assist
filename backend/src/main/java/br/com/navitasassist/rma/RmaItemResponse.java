package br.com.navitasassist.rma;

import java.time.LocalDate;

import br.com.navitasassist.item.ItemIdentification;
import br.com.navitasassist.product.Product;

public record RmaItemResponse(
    Long id,
    String productName,
    String productSku,
    String batchNumber,
    String serialNumber,
    LocalDate manufacturedAt,
    int warrantyMonths,
    LocalDate warrantyExpiresAt,
    WarrantyStatus warrantyStatus,
    WarrantyStatus calculatedWarrantyStatus,
    WarrantyOverrideResponse warrantyOverride
) {
    public static RmaItemResponse from(RmaItem item) {
        int months = item.getWarrantyMonths() == null ? item.getProduct().getDefaultWarrantyMonths() : item.getWarrantyMonths();
        return from(item.getId(), item.getProduct(), item.getItemIdentification(), ItemWarranty.calculate(item.getRma(), months), WarrantyOverrideResponse.from(item));
    }

    public static RmaItemResponse fromLegacy(RmaRecord rma) {
        return from(null, rma.getProduct(), rma.getItemIdentification(), ItemWarranty.calculate(rma, rma.getProduct().getDefaultWarrantyMonths()), null);
    }

    private static RmaItemResponse from(Long id, Product product, ItemIdentification identification, ItemWarranty warranty, WarrantyOverrideResponse override) {
        return new RmaItemResponse(
            id,
            product.getName(),
            product.getSku(),
            identification.getBatchNumber(),
            identification.getSerialNumber(),
            identification.getManufacturedAt(),
            warranty.months(),
            warranty.expiresAt(),
            override == null ? warranty.status() : override.status(),
            warranty.status(),
            override
        );
    }
}
