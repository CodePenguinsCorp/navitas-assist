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
import br.com.navitasassist.repository.PartReservationRepository;
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
    private PartReservationRepository partReservationRepository;

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
        partReservationRepository.deleteAll();
        partRepository.deleteAll();
        rmaRecordRepository.deleteAll();
        productRepository.deleteAll();
        clientRepository.deleteAll();
    }

    @Test
    void concurrentReservationsNeverReserveMoreThanOnHand() throws Exception {
        List<PartReservationStatus> statuses = runConcurrently(() -> partStockService.reserve(rma.getId(), new PartReservationRequest(part.getId(), BigDecimal.ONE, null)).status());

        assertEquals(5, statuses.stream().filter(status -> status == PartReservationStatus.ACTIVE).count());
        assertEquals(THREADS - 5, statuses.stream().filter(status -> status == PartReservationStatus.PENDING).count());
        Part reloaded = partRepository.findById(part.getId()).orElseThrow();
        assertEquals(0, reloaded.getReserved().compareTo(new BigDecimal("5")));
        assertEquals(0, reloaded.getAvailable().signum());
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
        record.setCode("RMA-CONC-0001");
        record.setProduct(productRepository.save(product));
        record.setClient(clientRepository.save(client));
        record.setEntryDate(LocalDate.now());
        record.setReceivedBy("Teste");
        record.setReportedFailure("Falha");
        record.setStatus(RmaStatus.IN_REPAIR);
        return rmaRecordRepository.save(record);
    }
}
