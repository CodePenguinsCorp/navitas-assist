package br.com.navitasassist.protocol;

import java.math.BigDecimal;

public record ProtocolTemplateItemResponse(
    Long id,
    int sortOrder,
    String stepName,
    String title,
    String instructions,
    ProtocolItemType type,
    boolean required,
    String unit,
    Integer decimalPlaces,
    BigDecimal minValue,
    BigDecimal maxValue,
    String expectedResult,
    boolean evidenceRequired
) {
    public static ProtocolTemplateItemResponse from(ProtocolTemplateItem item) {
        return new ProtocolTemplateItemResponse(
            item.getId(),
            item.getSortOrder(),
            item.getStepName(),
            item.getTitle(),
            item.getInstructions(),
            item.getType(),
            item.isRequired(),
            item.getUnit(),
            item.getDecimalPlaces(),
            ProtocolNumbers.scaled(item.getMinValue(), item.getDecimalPlaces()),
            ProtocolNumbers.scaled(item.getMaxValue(), item.getDecimalPlaces()),
            item.getExpectedResult(),
            item.isEvidenceRequired()
        );
    }
}
