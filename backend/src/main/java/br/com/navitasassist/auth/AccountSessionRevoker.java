package br.com.navitasassist.auth;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.session.SessionInformation;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
@RequiredArgsConstructor
public class AccountSessionRevoker {

    private final SessionRegistry sessionRegistry;

    public record AccessChanged(Long userId) { }

    @TransactionalEventListener
    public void revoke(AccessChanged event) {
        sessionRegistry.getAllSessions(event.userId(), false).forEach(SessionInformation::expireNow);
    }
}
