package br.com.navitasassist.service;

import java.text.Collator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import br.com.navitasassist.diagnosis.DiagnosisText;

/** Junta valores já usados em campos de texto livre para servir de sugestão. */
final class SuggestionLists {
    private SuggestionLists() {
    }

    /** Uma grafia por valor, sem diferenciar caixa nem acento (vale a mais antiga), em ordem alfabética. */
    static List<String> distinct(List<String> values) {
        Map<String, String> byKey = new LinkedHashMap<>();
        for (String value : values) {
            byKey.putIfAbsent(DiagnosisText.normalize(value), value);
        }
        Collator collator = Collator.getInstance(Locale.forLanguageTag("pt-BR"));
        collator.setStrength(Collator.PRIMARY);
        return byKey.values().stream().sorted(collator::compare).toList();
    }
}
