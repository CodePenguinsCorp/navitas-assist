package br.com.navitasassist.service;

import br.com.navitasassist.access.Permission;
import br.com.navitasassist.notification.NotificationEventType;
import br.com.navitasassist.user.UserAccount;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Decides who may see a notification type. Applied when notifications are generated and again when they are listed, so a
 * permission change takes effect immediately.
 */
@Component
@RequiredArgsConstructor
public class NotificationVisibilityPolicy {

    private final EffectivePermissionService effectivePermissionService;

    public boolean canReceive(UserAccount user, NotificationEventType type) {
        return user != null && user.isActive() && canView(user, type);
    }

    public boolean canView(UserAccount user, NotificationEventType type) {
        // Every current type only carries RMA data, which SecurityConfig exposes to holders of rma.ver
        // (GET /api/rmas/**). Types that expose more restricted data must narrow access here.
        return user != null && type != null && effectivePermissionService.has(user, Permission.RMA_VER);
    }
}
