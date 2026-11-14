package br.com.navitasassist.user;

import java.time.Instant;
import java.util.List;

import br.com.navitasassist.access.Permission;
import br.com.navitasassist.access.ProfileSummary;

/** Usuário na API: perfil e permissões extras, na ordem do catálogo. */
public record UserAccountResponse(
    Long id,
    String username,
    String fullName,
    String email,
    ProfileSummary profile,
    List<String> extraPermissions,
    boolean active,
    Instant updatedAt
) {
    public static UserAccountResponse from(UserAccount userAccount) {
        return new UserAccountResponse(
            userAccount.getId(),
            userAccount.getUsername(),
            userAccount.getFullName(),
            userAccount.getEmail(),
            ProfileSummary.from(userAccount.getProfile()),
            List.copyOf(Permission.codes(Permission.fromCodes(userAccount.getExtraPermissions()))),
            userAccount.isActive(),
            userAccount.getUpdatedAt()
        );
    }
}
