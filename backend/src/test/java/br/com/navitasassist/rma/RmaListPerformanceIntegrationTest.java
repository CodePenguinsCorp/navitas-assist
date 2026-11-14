package br.com.navitasassist.rma;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.service.RmaService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class RmaListPerformanceIntegrationTest {
    @Autowired EntityManager em;
    @Autowired EntityManagerFactory factory;
    @Autowired RmaService service;

    @Test
    void twentyOrdersUseAtMostThirtyStatementsWithColdPersistenceContext() {
        for (int i = 0; i < 20; i++) {
            Client client = new Client();
            client.setLegalName("Batch client " + i);
            em.persist(client);
            Product product = new Product();
            product.setSku("BATCH-" + i);
            product.setName("Batch product " + i);
            product.setDefaultWarrantyMonths(12);
            em.persist(product);
            RmaRecord order = new RmaRecord();
            order.setCode("BATCH-" + i);
            order.setClient(client);
            order.setProduct(product);
            order.setEntryDate(LocalDate.of(2026, 11, 13));
            order.setPurchaseDateUnknown(true);
            order.setReceivedBy("admin");
            order.setReportedFailure("Falha de teste.");
            RmaItem item = new RmaItem();
            item.setProduct(product);
            order.replaceItems(java.util.List.of(item));
            em.persist(order);
        }
        em.flush();
        em.clear();
        var statistics = factory.unwrap(SessionFactory.class).getStatistics();
        statistics.setStatisticsEnabled(true);
        statistics.clear();
        try {
            var orders = service.searchPage("BATCH-", null, 0, 20);
            assertEquals(20, orders.content().size());
            long statements = statistics.getPrepareStatementCount();
            System.out.println("20 OS: " + statements + " statements (teto 30).");
            assertTrue(statements <= 30, "20 OS usaram " + statements + " statements (teto 30).");
        } finally {
            statistics.setStatisticsEnabled(false);
        }
    }
}

