package br.com.navitasassist.auth;

import static org.assertj.core.api.Assertions.assertThat;
import org.junit.jupiter.api.Test;

class LoginAttemptDelayTest {
    @Test void failuresProgressToThirtySecondsWithoutBlockingTheAccount() {
        var delay = new LoginAttemptDelay();
        for (long seconds : new long[] {0, 0, 1, 2, 4, 8, 16, 30, 30, 30}) {
            assertThat(delay.failed("user", "192.0.2.1").toSeconds()).isEqualTo(seconds);
        }
        delay.succeeded(" USER ", "192.0.2.1");
        assertThat(delay.failed("user", "192.0.2.1")).isZero();
    }

    @Test void failuresAreIndependentForEachUsernameAndOrigin() {
        var delay = new LoginAttemptDelay();
        delay.failed(" USER ", "192.0.2.1");
        delay.failed("user", "192.0.2.1");
        assertThat(delay.failed("User", "192.0.2.1").toSeconds()).isEqualTo(1);
        assertThat(delay.failed("other", "192.0.2.1")).isZero();
        assertThat(delay.failed("user", "192.0.2.2")).isZero();
        delay.succeeded("other", "192.0.2.1");
        assertThat(delay.failed("user", "192.0.2.1").toSeconds()).isEqualTo(2);
    }
}
