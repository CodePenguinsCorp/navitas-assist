package br.com.navitasassist.user;

import java.time.Instant;

public record UserAccountResponse(
    Long id,
    String username,
    String fullName,
    UserRole role,
    boolean active,
    Instant createdAt,
    Instant updatedAt
) {
    public static UserAccountResponse from(UserAccount userAccount) {
        return new UserAccountResponse(
            userAccount.getId(),
            userAccount.getUsername(),
            userAccount.getFullName(),
            userAccount.getRole(),
            userAccount.isActive(),
            userAccount.getCreatedAt(),
            userAccount.getUpdatedAt()
        );
    }
}
