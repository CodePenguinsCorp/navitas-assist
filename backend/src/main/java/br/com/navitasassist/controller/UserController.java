package br.com.navitasassist.controller;

import java.security.Principal;
import java.util.List;

import br.com.navitasassist.service.UserAccountService;
import br.com.navitasassist.user.UserAccountRequest;
import br.com.navitasassist.user.UserAccountResponse;
import br.com.navitasassist.user.UserAccountUpdateRequest;
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
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserAccountService userAccountService;

    @GetMapping
    public List<UserAccountResponse> listAll() {
        return userAccountService.listAll();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public UserAccountResponse create(@Valid @RequestBody UserAccountRequest request) {
        return userAccountService.create(request);
    }

    @PutMapping("/{id}")
    public UserAccountResponse update(
        @PathVariable Long id,
        @Valid @RequestBody UserAccountUpdateRequest request
    ) {
        return userAccountService.update(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id, Principal principal) {
        userAccountService.delete(id, principal.getName());
    }
}
