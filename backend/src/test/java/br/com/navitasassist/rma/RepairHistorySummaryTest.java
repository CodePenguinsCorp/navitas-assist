package br.com.navitasassist.rma;

import static org.junit.jupiter.api.Assertions.*;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class RepairHistorySummaryTest {
    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "\t"})
    void omitsEmptyOptionalFields(String empty) {
        assertEquals("Peça aplicada: Cabo (código: C1), 1,125 m.",
            RepairHistorySummary.component("Peça aplicada", "Cabo (código: C1)", new BigDecimal("1.125"), "m", empty, empty));
    }

    @Test
    void keepsExistingPunctuationAndTrimsOptionalFields() {
        assertEquals("Componente externo: Cabo, 2 un. Motivo da troca: Falha! Lote: A1.",
            RepairHistorySummary.component("Componente externo", "Cabo", new BigDecimal("2.000"), "un", " Falha! ", " A1 "));
    }

    @Test
    void interventionSummaryOmitsHoursWhenAbsent() {
        assertEquals("Reparo registrado: Limpeza.", RepairHistorySummary.intervention("Reparo registrado", "Limpeza", null));
        assertEquals("Reparo registrado: Limpeza (1,5 h).", RepairHistorySummary.intervention("Reparo registrado", "Limpeza", new BigDecimal("1.500")));
    }

    @Test
    void keepsTheCompleteVoidReasonWithinTheHistoryLimit() {
        String reason = "R".repeat(1000);
        String summary = RepairHistorySummary.voided("Reparo anulado", "D".repeat(1000), reason);
        assertTrue(summary.length() <= 1500);
        assertTrue(summary.endsWith("Motivo: " + reason + "."));
    }
}
