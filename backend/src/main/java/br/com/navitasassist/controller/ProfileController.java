package br.com.navitasassist.controller;

import java.security.Principal;
import java.util.List;

import br.com.navitasassist.access.ProfileOptionResponse;
import br.com.navitasassist.access.ProfileRequest;
import br.com.navitasassist.access.ProfileResponse;
import br.com.navitasassist.pagination.PageResponse;
import br.com.navitasassist.service.AccessProfileService;
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
@RequestMapping("/api/profiles")
@RequiredArgsConstructor
public class ProfileController {

    private final AccessProfileService accessProfileService;

    @GetMapping
    public PageResponse<ProfileResponse> search(
        @RequestParam(required = false) String query,
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer size
    ) {
        return accessProfileService.search(query, page, size);
    }

    @GetMapping("/options")
    public List<ProfileOptionResponse> options() {
        return accessProfileService.options();
    }

    @GetMapping("/{id}")
    public ProfileResponse get(@PathVariable Long id) {
        return accessProfileService.get(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ProfileResponse create(@Valid @RequestBody ProfileRequest request, Principal principal) {
        return accessProfileService.create(request, principal.getName());
    }

    @PutMapping("/{id}")
    public ProfileResponse update(@PathVariable Long id, @Valid @RequestBody ProfileRequest request, Principal principal) {
        return accessProfileService.update(id, request, principal.getName());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id, Principal principal) {
        accessProfileService.delete(id, principal.getName());
    }
}
