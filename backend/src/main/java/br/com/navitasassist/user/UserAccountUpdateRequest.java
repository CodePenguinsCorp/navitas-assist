package br.com.navitasassist.user;

import java.util.Set;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record UserAccountUpdateRequest(
    @NotBlank @Size(max = 60) String username,
    @NotBlank @Size(max = 120) String fullName,
    @Size(min = 6, max = 72) String password,
    @NotNull Long profileId,
    Set<@NotBlank String> extraPermissions,
    boolean active,
    @Size(max = 254) String email
) {

    public UserAccountUpdateRequest(String username, String fullName, String password, Long profileId, Set<String> extraPermissions, boolean active) {
        this(username, fullName, password, profileId, extraPermissions, active, null);
    }

    @Override
    public String toString() {
        return "UserAccountUpdateRequest[username=" + username
            + ", fullName=" + fullName
            + ", password=[REDACTED], profileId=" + profileId
            + ", extraPermissions=" + extraPermissions
            + ", active=" + active + "]";
    }
}
