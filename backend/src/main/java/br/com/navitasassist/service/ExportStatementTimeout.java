package br.com.navitasassist.service;

import java.time.Duration;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Dá às exportações, ao laudo em PDF e à importação CSV um limite de banco maior que o das demais rotas
 * (`DB_STATEMENT_TIMEOUT`, 50 s). O ajuste vale só dentro da transação corrente (equivale a `SET LOCAL`):
 * ao terminar, a conexão volta ao limite do pool. O padrão (110 s) fica abaixo dos 120 s do frontend.
 */
@Slf4j
@Component
public class ExportStatementTimeout {
    private final JdbcTemplate jdbc;
    private final Duration limit;

    public ExportStatementTimeout(JdbcTemplate jdbc, @Value("${navitas.db.export-statement-timeout:110s}") Duration limit) {
        if (limit == null || limit.isNegative()) {
            throw new IllegalArgumentException("DB_EXPORT_STATEMENT_TIMEOUT não pode ser negativo.");
        }
        this.jdbc = jdbc;
        this.limit = limit;
    }

    /** Aplica o limite configurado para exportações. Exige transação ativa, onde o ajuste fica restrito. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void extend() {
        apply(limit);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void apply(Duration duration) {
        // set_config(..., true) é o SET LOCAL com parâmetro; 0 desliga o limite, como no PostgreSQL.
        jdbc.queryForObject("select set_config('statement_timeout', ?, true)", String.class, duration.toMillis() + "ms");
    }
}
