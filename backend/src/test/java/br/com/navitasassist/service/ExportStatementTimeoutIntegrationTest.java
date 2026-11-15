package br.com.navitasassist.service;

import static br.com.navitasassist.access.AccessTestSupport.asProfile;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(ExportStatementTimeoutIntegrationTest.SlowExportConfig.class)
class ExportStatementTimeoutIntegrationTest {

    @Autowired private JdbcTemplate jdbc;
    @Autowired private MockMvc mvc;
    @Autowired private PlatformTransactionManager transactions;
    @SpyBean private ExportStatementTimeout exportTimeout;

    @BeforeEach
    void resetSpy() {
        clearInvocations(exportTimeout);
    }

    private String timeout() {
        return jdbc.queryForObject("show statement_timeout", String.class);
    }

    @Test
    void insideTheTransactionTheLimitIsTheLargerOneAndOutsideItStaysFiftySeconds() {
        assertEquals("50s", timeout());
        var inside = new TransactionTemplate(transactions).execute(status -> {
            exportTimeout.extend();
            return timeout();
        });
        assertEquals("110s", inside);
        assertEquals("50s", timeout());
    }

    @Test
    void requiresAnActiveTransactionSoTheChangeNeverLeaksToThePool() {
        assertThrows(IllegalTransactionStateException.class, () -> exportTimeout.extend());
    }

    @Test
    void overrunInsideTheExtendedFlowStillBecomesTheFriendlyServiceUnavailable() throws Exception {
        mvc.perform(get("/api/test-slow-export").with(asProfile("admin", "ADMIN")))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.status").value(503))
            .andExpect(jsonPath("$.message").value("A consulta demorou mais do que o esperado e foi interrompida. Tente novamente ou use filtros mais específicos."));
    }

    @Test
    void csvExportsPdfAndImportsExtendTheLimit() throws Exception {
        mvc.perform(get("/api/reports/rmas/export.csv").with(asProfile("admin", "ADMIN"))).andExpect(status().isOk());
        verify(exportTimeout, atLeastOnce()).extend();
        clearInvocations(exportTimeout);

        mvc.perform(get("/api/reports/rmas/summary/export.csv").with(asProfile("admin", "ADMIN"))).andExpect(status().isOk());
        verify(exportTimeout, atLeastOnce()).extend();
        clearInvocations(exportTimeout);

        mvc.perform(get("/api/rmas/{id}/report.pdf", 987654321L).with(asProfile("admin", "ADMIN"))).andExpect(status().isNotFound());
        verify(exportTimeout, atLeastOnce()).extend();
        clearInvocations(exportTimeout);

        var file = new MockMultipartFile("file", "produtos.csv", "text/csv", "sku;nome\r\n".getBytes());
        mvc.perform(multipart("/api/products/imports/preview").file(file).with(asProfile("admin", "ADMIN")).with(csrf()));
        verify(exportTimeout, atLeastOnce()).extend();
        clearInvocations(exportTimeout);

        mvc.perform(multipart("/api/products/imports/confirm").file(file).with(asProfile("admin", "ADMIN")).with(csrf()));
        verify(exportTimeout, atLeastOnce()).extend();
    }

    @TestConfiguration
    static class SlowExportConfig {
        @Bean
        SlowExportController slowExportController(JdbcTemplate jdbc, ExportStatementTimeout timeout) {
            return new SlowExportController(jdbc, timeout);
        }
    }

    @RestController
    static class SlowExportController {
        private final JdbcTemplate jdbc;
        private final ExportStatementTimeout timeout;

        SlowExportController(JdbcTemplate jdbc, ExportStatementTimeout timeout) {
            this.jdbc = jdbc;
            this.timeout = timeout;
        }

        @GetMapping("/api/test-slow-export")
        @Transactional
        public String slow() {
            timeout.apply(Duration.ofMillis(300));
            jdbc.queryForObject("select pg_sleep(5)::text", String.class);
            return "never";
        }
    }
}
