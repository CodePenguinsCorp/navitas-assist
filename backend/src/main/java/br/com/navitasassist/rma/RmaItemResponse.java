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
    LocalDate manufacturedAt
) {
    public static RmaItemResponse from(RmaItem item) {
        return from(item.getId(), item.getProduct(), item.getItemIdentification());
    }

    public static RmaItemResponse fromLegacy(RmaRecord rma) {
        return from(null, rma.getProduct(), rma.getItemIdentification());
    }

    private static RmaItemResponse from(Long id, Product product, ItemIdentification identification) {
        return new RmaItemResponse(
            id,
            product.getId(),
            product.getName(),
            product.getSku(),
            identification.getBatchNumber(),
            identification.getSerialNumber(),
            identification.getManufacturedAt()
        );
    }
}
