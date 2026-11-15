package br.com.navitasassist.service;

import java.util.ArrayList;
import java.util.List;

import br.com.navitasassist.repository.PartRepository;
import br.com.navitasassist.repository.RmaBlockRepository;
import br.com.navitasassist.repository.RmaExternalComponentRepository;
import br.com.navitasassist.repository.RmaInterventionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Valores já usados nos campos de texto livre que se repetem entre registros. As sugestões iniciais fixas ficam na
 * interface; aqui vai só o que já foi digitado, sem repetir a mesma grafia (sem diferenciar caixa nem acento).
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SuggestionService {

    private final RmaInterventionRepository interventions;
    private final RmaBlockRepository blocks;
    private final PartRepository parts;
    private final RmaExternalComponentRepository externalComponents;

    public List<String> interventionTypes() {
        return SuggestionLists.distinct(interventions.findDistinctTypes());
    }

    public List<String> blockCategories() {
        return SuggestionLists.distinct(blocks.findDistinctCategories());
    }

    /** Unidades das peças somadas às dos componentes externos trocados. */
    public List<String> partUnits() {
        List<String> all = new ArrayList<>(parts.findDistinctUnits());
        all.addAll(externalComponents.findDistinctUnits());
        return SuggestionLists.distinct(all);
    }

    public List<String> partLocations() {
        return SuggestionLists.distinct(parts.findDistinctLocations());
    }
}
