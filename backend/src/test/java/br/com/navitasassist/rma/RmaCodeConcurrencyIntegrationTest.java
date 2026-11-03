package br.com.navitasassist.rma;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mockingDetails;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.ProductRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class RmaCodeConcurrencyIntegrationTest {
    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private ClientRepository clients;
    @Autowired private ProductRepository products;
    @Autowired private JdbcTemplate jdbc;
    @SpyBean private RmaRecordRepository rmas;
    private Client client;
    private Product product;

    @BeforeEach
    void prepare() {
        rmas.deleteAll();
        client = new Client();
        client.setLegalName("Code concurrency client");
        client = clients.saveAndFlush(client);
        product = new Product();
        product.setSku("CODE-" + UUID.randomUUID().toString().substring(0, 8));
        product.setName("Code concurrency product");
        product.setDefaultWarrantyMonths(12);
        product = products.saveAndFlush(product);
    }

    @AfterEach
    void cleanup() {
        rmas.deleteAll();
        products.deleteById(product.getId());
        clients.deleteById(client.getId());
    }

    @Test
    void secondCreationWaitsForFirstAllocationToCommit() throws Exception {
        var read = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var firstRead = new AtomicBoolean(true);
        doAnswer(invocation -> {
            Object result = mockingDetails(rmas).getMockCreationSettings().getDefaultAnswer().answer(invocation);
            if (firstRead.getAndSet(false)) {
                read.countDown();
                if (!release.await(15, TimeUnit.SECONDS)) throw new IllegalStateException("Allocation barrier timed out");
            }
            return result;
        }).when(rmas).findTopByCodeStartingWithOrderByCodeDesc(anyString());
        var pool = Executors.newFixedThreadPool(2);
        try {
            var first = pool.submit(() -> create("operator.one"));
            if (!read.await(10, TimeUnit.SECONDS)) {
                throw new AssertionError("First allocation not reached", first.get(1, TimeUnit.SECONDS).getResolvedException());
            }
            var second = pool.submit(() -> create("operator.two"));
            assertThrows(TimeoutException.class, () -> second.get(1, TimeUnit.SECONDS));
            release.countDown();
            JsonNode one = created(first.get(10, TimeUnit.SECONDS));
            JsonNode two = created(second.get(10, TimeUnit.SECONDS));
            assertEquals(prefix() + "000001", one.get("code").asText());
            assertEquals(prefix() + "000002", two.get("code").asText());
            assertEquals("operator.one", one.get("receivedBy").asText());
            assertEquals("operator.two", two.get("receivedBy").asText());
            assertEquals(2, rmas.count());
        } finally {
            release.countDown();
            pool.shutdown();
            assertTrue(pool.awaitTermination(20, TimeUnit.SECONDS));
        }
    }

    @Test
    void concurrentBurstPersistsEveryRequestWithUniqueCodes() throws Exception {
        int count = 8;
        var start = new CyclicBarrier(count);
        var pool = Executors.newFixedThreadPool(count);
        try {
            var futures = new java.util.ArrayList<java.util.concurrent.Future<MvcResult>>();
            for (int i = 0; i < count; i++) futures.add(pool.submit(() -> {
                start.await(10, TimeUnit.SECONDS);
                return create("operator");
            }));
            var codes = new HashSet<String>();
            for (var future : futures) codes.add(created(future.get(20, TimeUnit.SECONDS)).get("code").asText());
            assertEquals(count, codes.size());
            assertEquals(count, rmas.count());
            for (int i = 1; i <= count; i++) assertTrue(codes.contains(prefix() + String.format("%06d", i)));
        } finally {
            pool.shutdown();
            assertTrue(pool.awaitTermination(25, TimeUnit.SECONDS));
        }
    }

    @Test
    void invalidRequestAndRolledBackSaveDoNotConsumeCodeOrRetainLock() throws Exception {
        mvc.perform(post("/api/rmas").with(user("admin").roles("ADMIN")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
        var failOnce = new AtomicBoolean(true);
        doAnswer(invocation -> {
            if (failOnce.getAndSet(false)) throw new IllegalStateException("Forced save rollback");
            return mockingDetails(rmas).getMockCreationSettings().getDefaultAnswer().answer(invocation);
        }).when(rmas).save(any(RmaRecord.class));
        assertEquals(500, create("operator").getResponse().getStatus());
        assertEquals(0, rmas.count());
        assertEquals(prefix() + "000001", created(create("operator")).get("code").asText());
        assertEquals(prefix() + "000002", created(create("operator")).get("code").asText());
    }

    @Test
    void annualCapacityReturnsBusinessErrorAndReleasesLock() throws Exception {
        JsonNode first = created(create("operator"));
        jdbc.update("update rmas set code = ? where id = ?", prefix() + "999999", first.get("id").asLong());
        assertEquals(400, create("operator").getResponse().getStatus());
        assertEquals(1, rmas.count());
        jdbc.update("update rmas set code = ? where id = ?", prefix() + "000001", first.get("id").asLong());
        assertEquals(prefix() + "000002", created(create("operator")).get("code").asText());
    }

    private MvcResult create(String username) throws Exception {
        Map<String, Object> payload = Map.of("clientId", client.getId(), "purchaseDateUnknown", true,
            "entryDate", LocalDate.now(ZoneId.of("America/Sao_Paulo")).toString(), "reportedFailure", "Failure",
            "items", List.of(Map.of("productId", product.getId(), "serialNumber", "CODE-SERIAL")));
        return mvc.perform(post("/api/rmas").with(user(username).roles("SERVICE_DESK")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(payload))).andReturn();
    }

    private JsonNode created(MvcResult result) throws Exception {
        assertEquals(201, result.getResponse().getStatus(), result.getResponse().getContentAsString() + "; " + result.getResolvedException());
        return mapper.readTree(result.getResponse().getContentAsString());
    }

    private String prefix() {
        return "RMA-" + LocalDate.now(ZoneId.of("America/Sao_Paulo")).getYear() + "-";
    }
}
