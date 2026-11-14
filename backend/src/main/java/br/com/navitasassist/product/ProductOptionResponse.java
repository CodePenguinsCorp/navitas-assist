package br.com.navitasassist.product;

public record ProductOptionResponse(Long id, String sku, String name) {
    public static ProductOptionResponse from(Product entity) {
        return new ProductOptionResponse(entity.getId(), entity.getSku(), entity.getName());
    }
}
