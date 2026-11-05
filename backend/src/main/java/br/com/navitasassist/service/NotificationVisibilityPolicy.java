package br.com.navitasassist.service;

import br.com.navitasassist.notification.NotificationEventType;
import br.com.navitasassist.user.UserAccount;
import br.com.navitasassist.user.UserRole;
import org.springframework.stereotype.Component;

/**
 * Decides who may see a notification type. Applied when notifications are generated and again when they are listed, so a
 * role change takes effect immediately.
 */
@Component
public class NotificationVisibilityPolicy {

    public boolean canReceive(UserAccount user, NotificationEventType type) {
        return user != null && user.isActive() && canView(user.getRole(), type);
    }

    public boolean canView(UserRole role, NotificationEventType type) {
        // Every current type only carries RMA data, which SecurityConfig exposes to all authenticated roles
        // (GET /api/rmas/**). Types that expose more restricted data must narrow access here.
        return role != null && type != null;
    }
}
