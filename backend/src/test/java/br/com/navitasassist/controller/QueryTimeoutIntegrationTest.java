package br.com.navitasassist.controller;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static br.com.navitasassist.access.AccessTestSupport.asProfile;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.sql.SQLException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.UncategorizedSQLException;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(QueryTimeoutIntegrationTest.SlowQueryConfig.class)
class QueryTimeoutIntegrationTest {

    private static final String MESSAGE =
        "A consulta demorou mais do que o esperado e foi interrompida. Tente novamente ou use filtros mais específicos.";

    @Autowired private MockMvc mvc;
    @Autowired private JdbcTemplate jdbc;

    @Test
    void databaseStatementTimeoutBecomesServiceUnavailableWithPortugueseMessage() throws Exception {
        mvc.perform(get("/api/test-slow-query").with(asProfile("admin", "ADMIN")))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.status").value(503))
            .andExpect(jsonPath("$.message").value(MESSAGE))
            .andExpect(jsonPath("$.details").isEmpty())
            .andExpect(content().string(not(containsString("pg_sleep"))))
            .andExpect(content().string(not(containsString("57014"))));
    }

    @Test
    void handlerRecognisesTheTimeoutWhateverWrapsIt() {
        RestExceptionHandler handler = new RestExceptionHandler();
        var sqlState = new SQLException("canceling statement due to statement timeout", "57014");
        var wrapped = new RuntimeException("outer", new IllegalStateException("middle",
            new UncategorizedSQLException("task", "select 1", sqlState)));
        assertEquals(503, handler.handleGeneric(wrapped).getStatusCode().value());
        assertEquals(MESSAGE, handler.handleGeneric(wrapped).getBody().message());
        assertEquals(503, handler.handleSpringQueryTimeout(new org.springframework.dao.QueryTimeoutException("x")).getStatusCode().value());
        assertEquals(503, handler.handleJpaQueryTimeout(new jakarta.persistence.QueryTimeoutException("x")).getStatusCode().value());
    }

    @Test
    void otherSqlFailuresStayInternalErrors() {
        var other = new RuntimeException(new SQLException("boom", "23505"));
        assertEquals(500, new RestExceptionHandler().handleGeneric(other).getStatusCode().value());
    }

    @Test
    void connectionsOpenWithTheDefaultFiftySecondLimit() {
        assertEquals("50s", jdbc.queryForObject("show statement_timeout", String.class));
    }

    @TestConfiguration
    static class SlowQueryConfig {
        @org.springframework.context.annotation.Bean
        SlowQueryController slowQueryController(JdbcTemplate jdbc) {
            return new SlowQueryController(jdbc);
        }
    }

    @RestController
    static class SlowQueryController {
        private final JdbcTemplate jdbc;

        SlowQueryController(JdbcTemplate jdbc) {
            this.jdbc = jdbc;
        }

        @GetMapping("/api/test-slow-query")
        @Transactional
        public String slow() {
            jdbc.execute("SET LOCAL statement_timeout = '300ms'");
            jdbc.queryForObject("select pg_sleep(5)::text", String.class);
            return "never";
        }
    }
}
