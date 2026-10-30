package br.com.navitasassist.rma;

import java.time.LocalDate;

import br.com.navitasassist.item.ItemIdentification;
import br.com.navitasassist.product.Product;

public record RmaItemResponse(
    Long id,
    Long productId,
    String productName,
    String productSku,
    String batchNumber,
    String serialNumber,
    LocalDate manufacturedAt,
    int warrantyMonths,
    LocalDate warrantyExpiresAt,
    WarrantyStatus warrantyStatus
) {
    public static RmaItemResponse from(RmaItem item) {
        int months = item.getWarrantyMonths() == null ? item.getProduct().getDefaultWarrantyMonths() : item.getWarrantyMonths();
        return from(item.getId(), item.getProduct(), item.getItemIdentification(), ItemWarranty.calculate(item.getRma(), months));
    }

    public static RmaItemResponse fromLegacy(RmaRecord rma) {
        return from(null, rma.getProduct(), rma.getItemIdentification(), ItemWarranty.calculate(rma, rma.getProduct().getDefaultWarrantyMonths()));
    }

    private static RmaItemResponse from(Long id, Product product, ItemIdentification identification, ItemWarranty warranty) {
        return new RmaItemResponse(
            id,
            product.getId(),
            product.getName(),
            product.getSku(),
            identification.getBatchNumber(),
            identification.getSerialNumber(),
            identification.getManufacturedAt(),
            warranty.months(),
            warranty.expiresAt(),
            warranty.status()
        );
    }
}
