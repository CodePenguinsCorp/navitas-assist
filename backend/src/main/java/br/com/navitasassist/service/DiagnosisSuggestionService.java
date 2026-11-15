package br.com.navitasassist.service;

import java.text.Collator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import br.com.navitasassist.diagnosis.DiagnosisSuggestionsResponse;
import br.com.navitasassist.diagnosis.DiagnosisText;
import br.com.navitasassist.repository.DiagnosisRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class DiagnosisSuggestionService {

    private final DiagnosisRepository diagnosisRepository;

    @Transactional(readOnly = true)
    public DiagnosisSuggestionsResponse suggestions() {
        return new DiagnosisSuggestionsResponse(
            distinct(diagnosisRepository.findDistinctFailureTypes()),
            distinct(diagnosisRepository.findDistinctProbableCauses())
        );
    }

    /** One spelling per value without regard to case or accents (the oldest wins), in alphabetical order. */
    private static List<String> distinct(List<String> values) {
        Map<String, String> byKey = new LinkedHashMap<>();
        for (String value : values) {
            byKey.putIfAbsent(DiagnosisText.normalize(value), value);
        }
        Collator collator = Collator.getInstance(Locale.forLanguageTag("pt-BR"));
        collator.setStrength(Collator.PRIMARY);
        return byKey.values().stream().sorted(collator::compare).toList();
    }
}
