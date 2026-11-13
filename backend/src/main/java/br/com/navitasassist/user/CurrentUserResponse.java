package br.com.navitasassist.user;

import java.time.Instant;
import java.util.List;
import java.util.Set;

import br.com.navitasassist.access.Permission;
import br.com.navitasassist.access.ProfileSummary;

/**
 * Usuário da sessão ({@code POST /api/auth/login} e {@code GET /api/auth/me}): os dados de {@link UserAccountResponse}
 * mais as permissões efetivas, na ordem do catálogo.
 */
public record CurrentUserResponse(
    Long id,
    String username,
    String fullName,
    String email,
    ProfileSummary profile,
    List<String> extraPermissions,
    List<String> permissions,
    boolean active,
    Instant createdAt,
    Instant updatedAt
) {
    public static CurrentUserResponse from(UserAccount userAccount, Set<Permission> effectivePermissions) {
        UserAccountResponse user = UserAccountResponse.from(userAccount);
        return new CurrentUserResponse(
            user.id(),
            user.username(),
            user.fullName(),
            user.email(),
            user.profile(),
            user.extraPermissions(),
            List.copyOf(Permission.codes(effectivePermissions)),
            user.active(),
            user.createdAt(),
            user.updatedAt()
        );
    }
}
