package br.com.navitasassist.part;

import java.math.BigDecimal;

public record PartOptionResponse(Long id, String code, String name, String unit, BigDecimal available, boolean active) {
    public static PartOptionResponse from(Part entity) {
        return new PartOptionResponse(entity.getId(), entity.getCode(), entity.getName(), entity.getUnit(), entity.getAvailable(), entity.isActive());
    }
}
