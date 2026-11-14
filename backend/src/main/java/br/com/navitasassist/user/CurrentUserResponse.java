package br.com.navitasassist.user;

import java.util.Set;

import br.com.navitasassist.access.Permission;

/** Uso interno do login: o id da conta registra a sessão; só {@link #session()} vai para o frontend. */
public record CurrentUserResponse(Long id, SessionResponse session) {
    public static CurrentUserResponse from(UserAccount userAccount, Set<Permission> effectivePermissions) {
        return new CurrentUserResponse(userAccount.getId(), SessionResponse.from(userAccount, effectivePermissions));
    }
}
