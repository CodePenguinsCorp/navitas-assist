package br.com.navitasassist.user;

import java.time.Instant;
import java.util.List;
import java.util.Set;

import br.com.navitasassist.access.Permission;
import br.com.navitasassist.access.ProfileSummary;

/**
 * Usuário da sessão ({@code POST /api/auth/login} e {@code GET /api/auth/me}): os dados de {@link UserAccountResponse}
 * mais as permissões efetivas, na ordem do catálogo. {@code role} é provisório (etapa 8A), como em
 * {@link UserAccountResponse}.
 */
public record CurrentUserResponse(
    Long id,
    String username,
    String fullName,
    ProfileSummary profile,
    List<String> extraPermissions,
    List<String> permissions,
    String role,
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
            user.profile(),
            user.extraPermissions(),
            List.copyOf(Permission.codes(effectivePermissions)),
            user.role(),
            user.active(),
            user.createdAt(),
            user.updatedAt()
        );
    }
}
