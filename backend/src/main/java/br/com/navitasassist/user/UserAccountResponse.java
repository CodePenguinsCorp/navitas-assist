package br.com.navitasassist.user;

import java.time.Instant;
import java.util.List;

import br.com.navitasassist.access.Permission;
import br.com.navitasassist.access.ProfileSummary;

/**
 * Usuário na API. {@code role} é provisório (etapa 8A): o {@code legacy_code} do perfil, ou {@code null} em perfil
 * personalizado, para o frontend antigo seguir funcionando até a limpeza final.
 */
public record UserAccountResponse(
    Long id,
    String username,
    String fullName,
    ProfileSummary profile,
    List<String> extraPermissions,
    String role,
    boolean active,
    Instant createdAt,
    Instant updatedAt
) {
    public static UserAccountResponse from(UserAccount userAccount) {
        return new UserAccountResponse(
            userAccount.getId(),
            userAccount.getUsername(),
            userAccount.getFullName(),
            ProfileSummary.from(userAccount.getProfile()),
            List.copyOf(Permission.codes(Permission.fromCodes(userAccount.getExtraPermissions()))),
            userAccount.getProfile().getLegacyCode(),
            userAccount.isActive(),
            userAccount.getCreatedAt(),
            userAccount.getUpdatedAt()
        );
    }
}
