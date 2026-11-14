package br.com.navitasassist.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.core.read.ListAppender;
import br.com.navitasassist.service.UserAccountService;
import br.com.navitasassist.user.CurrentUserResponse;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.*;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfTokenRepository;

class AuthAuditLoggingTest {
    @Test void thirdConsecutiveFailureDelaysTheResponse() {
        var manager = mock(AuthenticationManager.class);
        when(manager.authenticate(any())).thenThrow(new BadCredentialsException("invalid"));
        var controller = new AuthController(mock(UserAccountService.class), mock(CsrfTokenRepository.class),
            new LoginSessionService(mock(UserAccountService.class), manager, mock(SecurityContextRepository.class),
                mock(CsrfTokenRepository.class), mock(SessionRegistry.class)), new LoginAttemptDelay());
        var request = new MockHttpServletRequest(); request.setRemoteAddr("192.0.2.11");
        for (int failure = 0; failure < 2; failure++) {
            assertThatThrownBy(() -> controller.login(new LoginRequest("delayed", "wrong"), request,
                new MockHttpServletResponse())).isInstanceOf(BadCredentialsException.class);
        }
        long start = System.nanoTime();
        assertThatThrownBy(() -> controller.login(new LoginRequest("delayed", "wrong"), request,
            new MockHttpServletResponse())).isInstanceOf(BadCredentialsException.class);
        assertThat(java.time.Duration.ofNanos(System.nanoTime() - start)).isGreaterThanOrEqualTo(java.time.Duration.ofSeconds(1));
    }

    @Test void loginLogsSafeNormalizedUsernameAndRemoteAddressAtTheRightLevels() {
        var accounts = mock(UserAccountService.class);
        var manager = mock(AuthenticationManager.class);
        var controller = new AuthController(accounts, mock(CsrfTokenRepository.class),
            new LoginSessionService(accounts, manager, mock(SecurityContextRepository.class), mock(CsrfTokenRepository.class), mock(SessionRegistry.class)), new LoginAttemptDelay());
        Logger logger = (Logger) LoggerFactory.getLogger(AuthController.class);
        var appender = new ListAppender<ch.qos.logback.classic.spi.ILoggingEvent>(); appender.start(); logger.addAppender(appender);
        var request = new MockHttpServletRequest(); request.setRemoteAddr("192.0.2.10"); request.addHeader("X-Forwarded-For", "198.51.100.1");
        try {
            var authenticated = UsernamePasswordAuthenticationToken.authenticated("USER", null, java.util.List.of());
            when(manager.authenticate(any())).thenReturn(authenticated);
            var current = mock(CurrentUserResponse.class); when(current.id()).thenReturn(1L); when(accounts.getCurrentUser("USER")).thenReturn(current);
            controller.login(new LoginRequest("  USER  ", "never-log-password"), request, new MockHttpServletResponse());
            when(manager.authenticate(any())).thenThrow(new BadCredentialsException("never-log-password"));
            assertThatThrownBy(() -> controller.login(new LoginRequest("  USER  ", "never-log-password"), request, new MockHttpServletResponse())).isInstanceOf(BadCredentialsException.class);
            assertThat(appender.list).hasSize(2);
            assertThat(appender.list.get(0).getLevel().toString()).isEqualTo("INFO");
            assertThat(appender.list.get(1).getLevel().toString()).isEqualTo("WARN");
            assertThat(appender.list).allSatisfy(event -> assertThat(event.getFormattedMessage()).contains("username=user", "ip=192.0.2.10").doesNotContain("never-log-password", "198.51.100.1"));
        } finally { logger.detachAppender(appender); SecurityContextHolder.clearContext(); }
    }
}
