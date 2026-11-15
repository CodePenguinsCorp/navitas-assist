package br.com.navitasassist.rma;

import static org.junit.jupiter.api.Assertions.*;
import br.com.navitasassist.service.RmaBoardService;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
class RmaBoardConcurrencyIntegrationTest {
    @Autowired JdbcTemplate jdbc;
    @Autowired RmaBoardService board;

    @Test
    void concurrentInsertionsInTheSameColumnHaveDistinctPositions() throws Exception {
        String key = UUID.randomUUID().toString().substring(0, 8);
        long client = jdbc.queryForObject("insert into clients (legal_name, created_at, updated_at) values (?, now(), now()) returning id", Long.class, key);
        long product = jdbc.queryForObject("insert into products (name, sku, default_warranty_months, created_at, updated_at) values (?, ?, 12, now(), now()) returning id", Long.class, key, key);
        var ids = new ArrayList<Long>();
        var pool = Executors.newFixedThreadPool(2);
        try {
            for (int i = 0; i < 2; i++) ids.add(jdbc.queryForObject("insert into rmas (code, client_id, product_id, purchase_date_unknown, entry_date, received_by, reported_failure, priority, status, created_at, updated_at) values (?, ?, ?, true, current_date, 'teste', 'Falha', 'LOW', 'RECEIVED', now(), now()) returning id", Long.class, key + i, client, product));
            var start = new CountDownLatch(1);
            var futures = ids.stream().map(id -> pool.submit(() -> {
                start.await();
                return board.position(id, new RmaBoardPositionRequest(RmaStatus.RECEIVED, null, null));
            })).toList();
            start.countDown();
            for (var future : futures) assertNotNull(future.get(20, TimeUnit.SECONDS));
            assertEquals(2, jdbc.queryForObject("select count(distinct board_position) from rmas where id in (?, ?)", Integer.class, ids.get(0), ids.get(1)));
        } finally {
            pool.shutdownNow();
            for (long id : ids) jdbc.update("delete from rmas where id = ?", id);
            jdbc.update("delete from products where id = ?", product);
            jdbc.update("delete from clients where id = ?", client);
        }
    }
}
