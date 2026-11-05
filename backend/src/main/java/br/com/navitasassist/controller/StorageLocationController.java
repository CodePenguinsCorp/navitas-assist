package br.com.navitasassist.controller;

import java.util.List;

import br.com.navitasassist.custody.StorageLocationRequest;
import br.com.navitasassist.custody.StorageLocationResponse;
import br.com.navitasassist.service.StorageLocationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/locations")
@RequiredArgsConstructor
public class StorageLocationController {

    private final StorageLocationService storageLocationService;

    @GetMapping
    public List<StorageLocationResponse> listAll() {
        return storageLocationService.listAll();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public StorageLocationResponse create(@Valid @RequestBody StorageLocationRequest request) {
        return storageLocationService.create(request);
    }

    @PutMapping("/{id}")
    public StorageLocationResponse update(@PathVariable Long id, @Valid @RequestBody StorageLocationRequest request) {
        return storageLocationService.update(id, request);
    }
}
