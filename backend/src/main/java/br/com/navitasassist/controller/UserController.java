package br.com.navitasassist.controller;

import java.security.Principal;
import java.util.List;

import br.com.navitasassist.pagination.PageResponse;
import br.com.navitasassist.service.UserAccountService;
import br.com.navitasassist.user.AssignableUserResponse;
import br.com.navitasassist.user.UserAccountRequest;
import br.com.navitasassist.user.UserAccountResponse;
import br.com.navitasassist.user.UserAccountUpdateRequest;
import br.com.navitasassist.user.UserSummaryResponse;
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
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserAccountService userAccountService;

    @GetMapping
    public PageResponse<UserAccountResponse> search(
        @RequestParam(required = false) String query,
        @RequestParam(required = false) Long profileId,
        @RequestParam(required = false) Boolean active,
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer size
    ) {
        return userAccountService.search(query, profileId, active, page, size);
    }

    @GetMapping("/summary")
    public UserSummaryResponse summarize() {
        return userAccountService.summarize();
    }

    @GetMapping("/assignable")
    public List<AssignableUserResponse> listAssignableTechnicians() {
        return userAccountService.listAssignableTechnicians();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public UserAccountResponse create(@Valid @RequestBody UserAccountRequest request, Principal principal) {
        return userAccountService.create(request, principal.getName());
    }

    @PutMapping("/{id}")
    public UserAccountResponse update(
        @PathVariable Long id,
        @Valid @RequestBody UserAccountUpdateRequest request,
        Principal principal
    ) {
        return userAccountService.update(id, request, principal.getName());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id, Principal principal) {
        userAccountService.delete(id, principal.getName());
    }
}
