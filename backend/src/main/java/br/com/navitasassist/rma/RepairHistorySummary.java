package br.com.navitasassist.rma;

import java.math.BigDecimal;

/** Frases exibidas no histórico de reparo da OS. */
public final class RepairHistorySummary {
    private RepairHistorySummary() {}

    public static String component(String title, String description, BigDecimal quantity, String unit, String reason, String batch) {
        return sentence(title + ": " + description + ", " + number(quantity) + " " + unit)
            + optional("Motivo da troca", reason) + optional("Lote", batch);
    }

    public static String intervention(String title, String description, BigDecimal hours) {
        return title + ": " + description + " (" + number(hours) + " h).";
    }

    public static String voided(String title, String description, String reason) {
        String shortDescription = description.length() > 120 ? description.substring(0, 120) + "…" : description;
        return sentence(title + ": " + shortDescription) + optional("Motivo", reason);
    }

    private static String number(BigDecimal value) {
        return value.stripTrailingZeros().toPlainString().replace('.', ',');
    }

    private static String optional(String label, String value) {
        return value == null || value.isBlank() ? "" : " " + sentence(label + ": " + value.trim());
    }

    private static String sentence(String value) {
        return value.matches("(?s).*[.!?…]$") ? value : value + ".";
    }
}
