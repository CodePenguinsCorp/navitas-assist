package br.com.navitasassist.protocol;

import java.math.BigDecimal;
import java.math.RoundingMode;

final class ProtocolNumbers {

    private ProtocolNumbers() {
    }

    static BigDecimal scaled(BigDecimal value, Integer decimalPlaces) {
        return value == null || decimalPlaces == null ? value : value.setScale(decimalPlaces, RoundingMode.UNNECESSARY);
    }

    static String plain(BigDecimal value, Integer decimalPlaces) {
        BigDecimal scaled = scaled(value, decimalPlaces);
        return scaled == null ? null : scaled.toPlainString();
    }
}
