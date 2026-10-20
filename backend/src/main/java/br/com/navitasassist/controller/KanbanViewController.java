package br.com.navitasassist.controller;

import java.security.Principal;
import java.util.List;

import br.com.navitasassist.kanban.KanbanViewRequest;
import br.com.navitasassist.kanban.KanbanViewResponse;
import br.com.navitasassist.service.KanbanViewService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/kanban-views")
@RequiredArgsConstructor
public class KanbanViewController {

    private final KanbanViewService kanbanViewService;

    @GetMapping
    public List<KanbanViewResponse> list(Principal principal) {
        return kanbanViewService.list(principal.getName());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public KanbanViewResponse create(
        Principal principal,
        @Valid @RequestBody KanbanViewRequest request
    ) {
        return kanbanViewService.create(principal.getName(), request);
    }

    @PutMapping("/{id}")
    public KanbanViewResponse update(
        Principal principal,
        @PathVariable Long id,
        @Valid @RequestBody KanbanViewRequest request
    ) {
        return kanbanViewService.update(principal.getName(), id, request);
    }

    @PatchMapping("/{id}/default")
    public KanbanViewResponse setDefault(Principal principal, @PathVariable Long id) {
        return kanbanViewService.setDefault(principal.getName(), id);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(Principal principal, @PathVariable Long id) {
        kanbanViewService.delete(principal.getName(), id);
    }
}
