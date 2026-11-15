package br.com.navitasassist.part;

import java.math.BigDecimal;
import java.text.Normalizer;
import java.util.Locale;
import java.util.Set;
import br.com.navitasassist.controller.BusinessException;

public final class QuantityRules {
    private static final Set<String> MEASURE_UNITS = Set.of(
        "kg", "g", "mg", "t", "l", "lt", "litro", "litros", "ml", "m", "metro", "metros",
        "cm", "mm", "km", "m2", "m3", "pol", "quilograma", "quilogramas", "grama", "gramas",
        "miligrama", "miligramas", "tonelada", "toneladas", "mililitro", "mililitros",
        "centimetro", "centimetros", "milimetro", "milimetros", "quilometro", "quilometros",
        "polegada", "polegadas"
    );

    private QuantityRules() {}

    public static boolean allowsFraction(String unit) {
        String normalized = Normalizer.normalize(unit == null ? "" : unit, Normalizer.Form.NFKD)
            .replaceAll("\\p{M}", "").replace(".", "").trim().toLowerCase(Locale.ROOT);
        return MEASURE_UNITS.contains(normalized);
    }

    public static void validate(BigDecimal quantity, String unit) {
        if (quantity == null || quantity.signum() <= 0) {
            throw new BusinessException("A quantidade deve ser maior que zero.");
        }
        validateFraction(quantity, unit);
    }

    public static void validateMinimum(BigDecimal quantity, String unit) {
        if (quantity == null || quantity.signum() < 0) {
            throw new BusinessException("O estoque mínimo não pode ser negativo.");
        }
        validateFraction(quantity, unit);
    }

    private static void validateFraction(BigDecimal quantity, String unit) {
        int scale = quantity.stripTrailingZeros().scale();
        if (!allowsFraction(unit) && scale > 0) {
            String label = unit == null || unit.isBlank() ? "UN" : unit.trim().toUpperCase(Locale.ROOT);
            throw new BusinessException("A unidade " + label + " não aceita quantidade fracionada. Informe um número inteiro.");
        }
        if (scale > 3) {
            throw new BusinessException("A quantidade deve ter no máximo 3 casas decimais.");
        }
    }
}
