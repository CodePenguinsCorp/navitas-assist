package br.com.navitasassist.part;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.PartMovementRepository;
import br.com.navitasassist.repository.PartRepository;
import br.com.navitasassist.repository.PartUsageRepository;
import br.com.navitasassist.repository.ProductRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.rma.RmaStatus;
import br.com.navitasassist.service.PartStockService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
class PartStockConcurrencyTest {

    private static final int THREADS = 12;

    @Autowired
    private PartStockService partStockService;

    @Autowired
    private PartRepository partRepository;

    @Autowired
    private PartUsageRepository partUsageRepository;

    @Autowired
    private PartMovementRepository partMovementRepository;

    @Autowired
    private RmaRecordRepository rmaRecordRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private ClientRepository clientRepository;

    private RmaRecord rma;
    private Part part;

    @BeforeEach
    void setUp() {
        cleanUp();
        rma = createRma();
        part = new Part();
        part.setCode("PCA-CONC");
        part.setName("Peça concorrente");
        part.setUnit("un");
        part.setUnitCost(new BigDecimal("3.50"));
        part = partRepository.save(part);
        partStockService.registerMovement(part.getId(), new PartMovementRequest(PartMovementType.ENTRY, new BigDecimal("5"), null));
    }

    @AfterEach
    void cleanUp() {
        partMovementRepository.deleteAll();
        partUsageRepository.deleteAll();
        partRepository.deleteAll();
        rmaRecordRepository.deleteAll();
        productRepository.deleteAll();
        clientRepository.deleteAll();
    }

    @Test
    void concurrentUsagesNeverConsumeMoreThanOnHand() throws Exception {
        List<Boolean> results = runConcurrently(() -> {
            try {
                partStockService.use(rma.getId(), new PartUsageRequest(part.getId(), BigDecimal.ONE, "Falha", null, null));
                return true;
            } catch (br.com.navitasassist.controller.ConflictException exception) { return false; }
        });
        assertEquals(5, results.stream().filter(Boolean::booleanValue).count());
        assertEquals(0, partRepository.findById(part.getId()).orElseThrow().getOnHand().signum());
        assertEquals(6, partMovementRepository.findByPart_IdOrderByIdDesc(part.getId()).size());
    }

    @Test
    void concurrentExitsNeverProduceNegativeBalance() throws Exception {
        AtomicInteger rejected = new AtomicInteger();
        List<Boolean> results = runConcurrently(() -> {
            try {
                partStockService.registerMovement(part.getId(), new PartMovementRequest(PartMovementType.EXIT, BigDecimal.ONE, null));
                return true;
            } catch (BusinessException exception) {
                rejected.incrementAndGet();
                return false;
            }
        });

        assertEquals(5, results.stream().filter(Boolean::booleanValue).count());
        assertEquals(THREADS - 5, rejected.get());
        assertEquals(0, partRepository.findById(part.getId()).orElseThrow().getOnHand().signum());
        assertEquals(6, partMovementRepository.findByPart_IdOrderByIdDesc(part.getId()).size());
    }

    private <T> List<T> runConcurrently(Callable<T> task) throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(THREADS);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<T>> futures = new ArrayList<>();
            for (int i = 0; i < THREADS; i++) {
                futures.add(executor.submit(() -> {
                    start.await();
                    return task.call();
                }));
            }
            start.countDown();
            List<T> results = new ArrayList<>();
            for (Future<T> future : futures) {
                results.add(future.get(30, TimeUnit.SECONDS));
            }
            return results;
        } finally {
            executor.shutdownNow();
        }
    }

    private RmaRecord createRma() {
        Product product = new Product();
        product.setSku("SKU-CONC");
        product.setName("Produto concorrente");
        Client client = new Client();
        client.setLegalName("Cliente concorrente");
        RmaRecord record = new RmaRecord();
        record.setCode("OS-CONC-0001");
        record.setProduct(productRepository.save(product));
        record.setClient(clientRepository.save(client));
        record.setEntryDate(LocalDate.now());
        record.setReceivedBy("Teste");
        record.setReportedFailure("Falha");
        record.setStatus(RmaStatus.IN_REPAIR);
        return rmaRecordRepository.save(record);
    }
}
