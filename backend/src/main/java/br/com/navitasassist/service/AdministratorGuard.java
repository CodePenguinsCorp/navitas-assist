package br.com.navitasassist.service;

import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.function.Predicate;

import br.com.navitasassist.access.AccessProfile;
import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.repository.AccessProfileRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.user.UserAccount;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Garante que sempre reste ao menos um usuário ativo com {@code usuarios.gerir} e {@code perfis.gerir} (spec §4.3).
 *
 * <p>Toda operação que pode reduzir acesso chama {@link #lockAccessGraph()} antes de travar o alvo: perfis (por id) e
 * depois usuários ativos (por id). O login trava só a linha do próprio usuário e nunca perfis, então não há ciclo.
 */
@Service
@RequiredArgsConstructor
@Transactional(propagation = Propagation.MANDATORY)
public class AdministratorGuard {

    static final String MESSAGE = "At least one active administrator must remain.";

    private final AccessProfileRepository accessProfileRepository;
    private final UserAccountRepository userAccountRepository;
    private final EffectivePermissionService effectivePermissionService;

    public void lockAccessGraph() {
        accessProfileRepository.findAllForUpdate();
        userAccountRepository.findAllActiveForUpdate();
    }

    public void ensureRemainsAfterUserChange(UserAccount current, AccessProfile newProfile, Set<String> newExtras, boolean newActive) {
        boolean remainsAdministrator = newActive && effectivePermissionService.isAdministrator(
            effectivePermissionService.effectivePermissions(newProfile.getPermissions(), newExtras));
        ensureRemains(others(current), remainsAdministrator);
    }

    public void ensureRemainsAfterUserDeletion(UserAccount current) {
        ensureRemains(others(current), false);
    }

    public void ensureRemainsAfterProfileChange(AccessProfile profile, Set<String> newPermissions) {
        List<UserAccount> active = userAccountRepository.findAllActiveForUpdate();
        long before = active.stream().filter(effectivePermissionService::isAdministrator).count();
        long after = active.stream()
            .filter(account -> effectivePermissionService.isAdministrator(
                hasProfile(account, profile)
                    ? effectivePermissionService.effectivePermissions(newPermissions, account.getExtraPermissions())
                    : effectivePermissionService.effectivePermissions(account)))
            .count();
        check(before, after);
    }

    private void ensureRemains(Predicate<UserAccount> unchanged, boolean targetRemainsAdministrator) {
        List<UserAccount> active = userAccountRepository.findAllActiveForUpdate();
        long before = active.stream().filter(effectivePermissionService::isAdministrator).count();
        long after = active.stream().filter(unchanged).filter(effectivePermissionService::isAdministrator).count()
            + (targetRemainsAdministrator ? 1 : 0);
        check(before, after);
    }

    /** Se já não havia administrador ativo, a mudança passa, para não travar o sistema. */
    private static void check(long before, long after) {
        if (before > 0 && after == 0) {
            throw new BusinessException(MESSAGE);
        }
    }

    private static Predicate<UserAccount> others(UserAccount current) {
        return account -> !Objects.equals(account.getId(), current.getId());
    }

    private static boolean hasProfile(UserAccount account, AccessProfile profile) {
        return account.getProfile() != null && Objects.equals(account.getProfile().getId(), profile.getId());
    }
}
