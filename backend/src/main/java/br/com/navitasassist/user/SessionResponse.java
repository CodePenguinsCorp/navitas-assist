package br.com.navitasassist.user;

import java.util.List;
import java.util.Set;

import br.com.navitasassist.access.Permission;

/**
 * Sessão ({@code POST /api/auth/login} e {@code GET /api/auth/me}): só o que o frontend usa para identificar o usuário e
 * liberar as telas, com as permissões efetivas na ordem do catálogo.
 */
public record SessionResponse(String username, String fullName, String email, String profileName, List<String> permissions) {
    public static SessionResponse from(UserAccount userAccount, Set<Permission> effectivePermissions) {
        return new SessionResponse(
            userAccount.getUsername(),
            userAccount.getFullName(),
            userAccount.getEmail(),
            userAccount.getProfile() == null ? null : userAccount.getProfile().getName(),
            List.copyOf(Permission.codes(effectivePermissions))
        );
    }
}
