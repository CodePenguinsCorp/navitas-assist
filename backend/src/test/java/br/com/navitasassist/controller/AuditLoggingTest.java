package br.com.navitasassist.controller;

import static org.assertj.core.api.Assertions.assertThat;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

class AuditLoggingTest {
    @Test
    void genericErrorHasOccurrenceCodeAndLogsCauseWithoutExposingIt() {
        Logger logger = (Logger) LoggerFactory.getLogger(RestExceptionHandler.class);
        ListAppender<ch.qos.logback.classic.spi.ILoggingEvent> appender = new ListAppender<>();
        appender.start(); logger.addAppender(appender);
        try {
            var response = new RestExceptionHandler().handleGeneric(new IllegalStateException("SQL password secret /private/path"));
            assertThat(response.getBody().message()).matches("Erro inesperado\\. Informe o código [A-F0-9]{8} ao suporte\\.");
            assertThat(response.getBody().details()).isEmpty();
            assertThat(appender.list).hasSize(1);
            assertThat(appender.list.get(0).getLevel().toString()).isEqualTo("ERROR");
            assertThat(appender.list.get(0).getThrowableProxy()).isNotNull();
            String code = response.getBody().message().split(" ")[5];
            assertThat(appender.list.get(0).getFormattedMessage()).contains(code);
        } finally { logger.detachAppender(appender); }
    }
}
