package br.com.navitasassist.access;

import java.util.Arrays;
import java.util.List;

public record PermissionModuleResponse(String module, String label, List<PermissionItemResponse> permissions) {

    /** O catálogo agrupado por módulo, na ordem dos enums. */
    public static List<PermissionModuleResponse> catalog() {
        return Arrays.stream(PermissionModule.values())
            .map(module -> new PermissionModuleResponse(module.name(), module.label(), Arrays.stream(Permission.values())
                .filter(permission -> permission.module() == module)
                .map(PermissionItemResponse::from)
                .toList()))
            .toList();
    }
}
