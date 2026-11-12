package br.com.navitasassist.service;

import java.util.EnumSet;
import java.util.Set;

import br.com.navitasassist.access.Permission;
import br.com.navitasassist.user.UserAccount;
import org.springframework.stereotype.Component;

/**
 * Permissão efetiva = permissões do perfil ∪ extras do usuário, convertidas pelo catálogo (códigos desconhecidos são
 * ignorados). "Administrador" é quem tem {@code usuarios.gerir} e {@code perfis.gerir}; a situação ativa não entra na conta.
 */
@Component
public class EffectivePermissionService {

    public Set<Permission> effectivePermissions(UserAccount account) {
        if (account == null) {
            return EnumSet.noneOf(Permission.class);
        }
        Set<String> profilePermissions = account.getProfile() == null ? null : account.getProfile().getPermissions();
        return effectivePermissions(profilePermissions, account.getExtraPermissions());
    }

    public Set<Permission> effectivePermissions(Set<String> profilePermissions, Set<String> extras) {
        EnumSet<Permission> permissions = EnumSet.noneOf(Permission.class);
        permissions.addAll(Permission.fromCodes(profilePermissions));
        permissions.addAll(Permission.fromCodes(extras));
        return permissions;
    }

    public boolean has(UserAccount account, Permission permission) {
        return effectivePermissions(account).contains(permission);
    }

    public boolean isAdministrator(UserAccount account) {
        return isAdministrator(effectivePermissions(account));
    }

    public boolean isAdministrator(Set<Permission> permissions) {
        return permissions.contains(Permission.USUARIOS_GERIR) && permissions.contains(Permission.PERFIS_GERIR);
    }
}
