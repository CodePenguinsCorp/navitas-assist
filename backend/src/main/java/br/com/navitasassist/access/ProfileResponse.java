package br.com.navitasassist.access;

import java.time.Instant;
import java.util.List;

public record ProfileResponse(
    Long id,
    String name,
    List<String> permissions,
    long userCount,
    Instant createdAt,
    Instant updatedAt
) {
    public static ProfileResponse from(AccessProfile profile, long userCount) {
        return new ProfileResponse(profile.getId(), profile.getName(), orderedCodes(profile), userCount,
            profile.getCreatedAt(), profile.getUpdatedAt());
    }

    /** Códigos do perfil na ordem do catálogo. */
    static List<String> orderedCodes(AccessProfile profile) {
        return List.copyOf(Permission.codes(Permission.fromCodes(profile.getPermissions())));
    }
}
