package br.com.navitasassist.controller;

import java.util.List;

import br.com.navitasassist.client.ClientRequest;
import br.com.navitasassist.client.ClientResponse;
import br.com.navitasassist.client.ClientSummaryResponse;
import br.com.navitasassist.pagination.PageResponse;
import br.com.navitasassist.service.ClientService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/clients")
@RequiredArgsConstructor
public class ClientController {

    private final ClientService clientService;

    @GetMapping
    public PageResponse<ClientResponse> search(
        @RequestParam(required = false) String query,
        @RequestParam(required = false) Boolean hasDocument,
        @RequestParam(required = false) Boolean hasEmail,
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer size
    ) {
        return clientService.search(query, hasDocument, hasEmail, page, size);
    }

    @GetMapping("/options")
    public List<ClientResponse> listOptions() {
        return clientService.listOptions();
    }

    @GetMapping("/summary")
    public ClientSummaryResponse summarize() {
        return clientService.summarize();
    }

    @GetMapping("/{id}")
    public ClientResponse getById(@PathVariable Long id) {
        return clientService.getById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ClientResponse create(@Valid @RequestBody ClientRequest request) {
        return clientService.create(request);
    }

    @PutMapping("/{id}")
    public ClientResponse update(@PathVariable Long id, @Valid @RequestBody ClientRequest request) {
        return clientService.update(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        clientService.delete(id);
    }
}
