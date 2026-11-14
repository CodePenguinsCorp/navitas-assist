package br.com.navitasassist.rma;

/** Item resumido das coleções de OS: rótulos, garantia por produto e busca do Kanban. */
public record RmaItemSummaryResponse(
    Long id,
    String productName,
    String productSku,
    String batchNumber,
    String serialNumber,
    WarrantyStatus warrantyStatus
) {
    public static RmaItemSummaryResponse from(RmaItemResponse item) {
        return new RmaItemSummaryResponse(item.id(), item.productName(), item.productSku(), item.batchNumber(),
            item.serialNumber(), item.warrantyStatus());
    }
}
