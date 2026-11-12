package br.com.navitasassist.controller;

import java.util.List;

import br.com.navitasassist.access.PermissionModuleResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/permissions")
public class PermissionController {

    @GetMapping
    public List<PermissionModuleResponse> catalog() {
        return PermissionModuleResponse.catalog();
    }
}
