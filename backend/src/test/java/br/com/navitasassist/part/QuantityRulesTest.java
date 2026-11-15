package br.com.navitasassist.part;

import static org.junit.jupiter.api.Assertions.*;
import java.math.BigDecimal;
import br.com.navitasassist.controller.BusinessException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class QuantityRulesTest {
    @ParameterizedTest
    @ValueSource(strings = {"kg", "g", "mg", "t", "l", "lt", "litro", "litros", "ml", "m", "metro", "metros",
        "cm", "mm", "km", "m2", "m²", "m3", "m³", "pol", "quilograma", "quilogramas", "grama", "gramas",
        "miligrama", "miligramas", "tonelada", "toneladas", "mililitro", "mililitros", "centímetro", "centímetros",
        "milímetro", "milímetros", "quilômetro", "quilômetros", "polegada", "polegadas", " KG. ", "L.T.", "M²", " METRÓS. "})
    void acceptsFractionsForMeasuresWithNormalizedSpelling(String unit) {
        assertTrue(QuantityRules.allowsFraction(unit));
        assertDoesNotThrow(() -> QuantityRules.validate(new BigDecimal("1.222"), unit));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"un", "und", "unid", "unidade", "unidades", "pc", "pç", "peça", "peca", "par", "jogo",
        "kit", "cx", "caixa", "rolo", "desconhecida", "UN.", "   ", "kg/un", "gramado"})
    void treatsAllOtherUnitsAsCountable(String unit) {
        assertFalse(QuantityRules.allowsFraction(unit));
        assertThrows(BusinessException.class, () -> QuantityRules.validate(new BigDecimal("1.222"), unit));
        assertDoesNotThrow(() -> QuantityRules.validate(new BigDecimal("2.000"), unit));
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "-1", "-0.125"})
    void requiresPositiveQuantityEvenForMeasures(String quantity) {
        assertThrows(BusinessException.class, () -> QuantityRules.validate(new BigDecimal(quantity), "kg"));
    }

    @Test
    void validatesPrecisionAndZeroMinimum() {
        assertDoesNotThrow(() -> QuantityRules.validateMinimum(BigDecimal.ZERO, "un"));
        assertDoesNotThrow(() -> QuantityRules.validate(new BigDecimal("1.2220"), "kg"));
        assertThrows(BusinessException.class, () -> QuantityRules.validate(new BigDecimal("1.2221"), "kg"));
        assertThrows(BusinessException.class, () -> QuantityRules.validateMinimum(new BigDecimal("-1"), "kg"));
        assertThrows(BusinessException.class, () -> QuantityRules.validateMinimum(new BigDecimal("0.5"), "un"));
        assertThrows(BusinessException.class, () -> QuantityRules.validate(null, "un"));
    }
}
