package br.com.navitasassist.controller;

import br.com.navitasassist.rma.*;
import br.com.navitasassist.service.RmaBoardService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/rmas")
@RequiredArgsConstructor
public class RmaBoardController {
    private final RmaBoardService service;

    @GetMapping("/board/column")
    public RmaBoardPageResponse column(@ModelAttribute RmaBoardFilters filters,
        @RequestParam(required = false) Integer page, @RequestParam(required = false) Integer size) {
        return service.column(filters, page, size);
    }

    @GetMapping("/board/counts")
    public RmaBoardCountsResponse counts(@ModelAttribute RmaBoardFilters filters) { return service.counts(filters); }

    @PutMapping("/{id}/board-position")
    public RmaBoardCardResponse position(@PathVariable Long id, @Valid @RequestBody RmaBoardPositionRequest request) {
        return service.position(id, request);
    }
}
