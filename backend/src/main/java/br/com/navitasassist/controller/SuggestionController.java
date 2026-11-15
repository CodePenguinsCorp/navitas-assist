package br.com.navitasassist.controller;

import java.util.List;

import br.com.navitasassist.service.SuggestionService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Sugestões dos campos de texto livre: cada rota devolve só os valores já usados, em ordem alfabética. */
@RestController
@RequestMapping("/api/suggestions")
@RequiredArgsConstructor
public class SuggestionController {

    private final SuggestionService suggestionService;

    @GetMapping("/intervention-types")
    public List<String> interventionTypes() {
        return suggestionService.interventionTypes();
    }

    @GetMapping("/block-categories")
    public List<String> blockCategories() {
        return suggestionService.blockCategories();
    }

    @GetMapping("/part-units")
    public List<String> partUnits() {
        return suggestionService.partUnits();
    }

    @GetMapping("/part-locations")
    public List<String> partLocations() {
        return suggestionService.partLocations();
    }
}
