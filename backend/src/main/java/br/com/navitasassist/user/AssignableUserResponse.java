package br.com.navitasassist.user;

public record AssignableUserResponse(
    Long id,
    String username,
    String fullName
) {
    public static AssignableUserResponse from(UserAccount userAccount) {
        return new AssignableUserResponse(
            userAccount.getId(),
            userAccount.getUsername(),
            userAccount.getFullName()
        );
    }
}
