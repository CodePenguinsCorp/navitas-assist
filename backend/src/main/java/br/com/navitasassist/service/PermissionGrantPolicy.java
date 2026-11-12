package br.com.navitasassist.service;

import java.util.Set;

import br.com.navitasassist.access.Permission;
import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.repository.UserAccountRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Regra anti-escalada (spec §4.4): quem não é administrador só concede permissões que ele mesmo tem efetivamente.
 */
@Component
@RequiredArgsConstructor
public class PermissionGrantPolicy {

    static final String MESSAGE = "Você não pode conceder permissões que não possui.";

    private final UserAccountRepository userAccountRepository;
    private final EffectivePermissionService effectivePermissionService;

    public void ensureCanGrant(String actorUsername, Set<Permission> granted) {
        Set<Permission> own = userAccountRepository.findByUsernameIgnoreCase(actorUsername == null ? "" : actorUsername)
            .map(effectivePermissionService::effectivePermissions)
            .orElse(Set.of());
        if (effectivePermissionService.isAdministrator(own)) {
            return;
        }
        if (!own.containsAll(granted)) {
            throw new BusinessException(MESSAGE);
        }
    }
}
