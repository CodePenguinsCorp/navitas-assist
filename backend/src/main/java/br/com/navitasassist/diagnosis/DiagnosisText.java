package br.com.navitasassist.diagnosis;

import java.text.Normalizer;
import java.util.Locale;

/** Comparison key for the free-text failure type and cause: no case, no accents, no surrounding spaces. */
public final class DiagnosisText {
    private DiagnosisText() {
    }

    public static String normalize(String value) {
        if (value == null) {
            return "";
        }
        return Normalizer.normalize(value.trim(), Normalizer.Form.NFD).replaceAll("\\p{M}+", "").toLowerCase(Locale.ROOT);
    }
}
