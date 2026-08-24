package br.com.navitasassist.controller;

import java.util.List;

import br.com.navitasassist.service.UserAccountService;
import br.com.navitasassist.user.UserAccountRequest;
import br.com.navitasassist.user.UserAccountResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
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
}
