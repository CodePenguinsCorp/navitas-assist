package br.com.navitasassist.access;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.EnumSet;
import java.util.HashSet;
import java.util.Set;

import br.com.navitasassist.service.EffectivePermissionService;
import br.com.navitasassist.user.UserAccount;
import org.junit.jupiter.api.Test;

class EffectivePermissionServiceTest {

    private final EffectivePermissionService service = new EffectivePermissionService();

    @Test
    void unionOfProfileAndExtras() {
        UserAccount account = account(Set.of("rma.ver", "pecas.ver"), Set.of("rma.abrir", "rma.ver"));

        assertEquals(EnumSet.of(Permission.RMA_VER, Permission.RMA_ABRIR, Permission.PECAS_VER),
            service.effectivePermissions(account));
        assertTrue(service.has(account, Permission.RMA_ABRIR));
        assertFalse(service.has(account, Permission.RMA_EDITAR));
    }

    @Test
    void ignoresUnknownCodes() {
        UserAccount account = account(Set.of("rma.ver", "modulo.inexistente"), Set.of("ROLE_ADMIN", "relatorios.ver"));

        assertEquals(EnumSet.of(Permission.RMA_VER, Permission.RELATORIOS_VER), service.effectivePermissions(account));
    }

    @Test
    void administratorNeedsBothAdminPermissions() {
        assertTrue(service.isAdministrator(account(Set.of("usuarios.gerir", "perfis.gerir"), Set.of())));
        assertTrue(service.isAdministrator(account(Set.of("usuarios.gerir"), Set.of("perfis.gerir"))));
        assertFalse(service.isAdministrator(account(Set.of("usuarios.gerir", "notificacoes.regras"), Set.of())));
        assertFalse(service.isAdministrator(account(Set.of("rma.ver"), Set.of("perfis.gerir"))));
        assertFalse(service.isAdministrator(EnumSet.noneOf(Permission.class)));

        UserAccount inactive = account(Set.of("usuarios.gerir", "perfis.gerir"), Set.of());
        inactive.setActive(false);
        assertTrue(service.isAdministrator(inactive), "active não entra na conta");
    }

    @Test
    void effectivePermissionsFromCodeSets() {
        assertEquals(EnumSet.of(Permission.RMA_VER, Permission.RMA_STATUS),
            service.effectivePermissions(Set.of("rma.ver", "x"), Set.of("rma.status")));
        assertEquals(EnumSet.of(Permission.RMA_VER), service.effectivePermissions(Set.of("rma.ver"), null));
    }

    private static UserAccount account(Set<String> profilePermissions, Set<String> extras) {
        AccessProfile profile = new AccessProfile();
        profile.setName("Perfil de teste");
        profile.setPermissions(new HashSet<>(profilePermissions));
        UserAccount account = new UserAccount();
        account.setUsername("unit.user");
        account.setProfile(profile);
        account.setExtraPermissions(new HashSet<>(extras));
        account.setActive(true);
        return account;
    }
}
