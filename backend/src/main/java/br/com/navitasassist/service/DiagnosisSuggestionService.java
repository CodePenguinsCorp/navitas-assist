package br.com.navitasassist.service;

import java.util.List;

import br.com.navitasassist.diagnosis.DiagnosisSuggestionsResponse;
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
            SuggestionLists.distinct(diagnosisRepository.findDistinctFailureTypes()),
            SuggestionLists.distinct(diagnosisRepository.findDistinctProbableCauses())
        );
    }
}
