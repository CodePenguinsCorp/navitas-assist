package br.com.navitasassist.access;

public record PermissionItemResponse(String code, String label) {
    public static PermissionItemResponse from(Permission permission) {
        return new PermissionItemResponse(permission.code(), permission.label());
    }
}
