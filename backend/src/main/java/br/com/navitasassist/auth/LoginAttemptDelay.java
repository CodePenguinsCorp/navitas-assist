package br.com.navitasassist.auth;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Locale;
import org.springframework.stereotype.Component;

/** Atraso por usuário e origem, sem bloquear contas nem manter histórico ilimitado. */
@Component
public class LoginAttemptDelay {
    private record Key(String username, String origin) {}
    private final LinkedHashMap<Key, Integer> failures = new LinkedHashMap<>(16, 0.75f, true);

    public synchronized Duration failed(String username, String origin) {
        Key key = key(username, origin);
        if (!failures.containsKey(key) && failures.size() >= 10_000) {
            failures.remove(failures.keySet().iterator().next());
        }
        int count = Math.min(8, failures.getOrDefault(key, 0) + 1);
        failures.put(key, count);
        return Duration.ofSeconds(count < 3 ? 0 : Math.min(30, 1 << (count - 3)));
    }

    public synchronized void succeeded(String username, String origin) {
        failures.remove(key(username, origin));
    }

    private Key key(String username, String origin) {
        return new Key(username.trim().toLowerCase(Locale.ROOT), origin);
    }
}
