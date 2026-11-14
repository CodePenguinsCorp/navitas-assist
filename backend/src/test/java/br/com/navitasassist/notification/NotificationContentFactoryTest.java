package br.com.navitasassist.notification;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import java.time.Instant;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.rma.RmaPriority;
import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.service.NotificationContentFactory;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class NotificationContentFactoryTest {

    private final NotificationContentFactory factory = new NotificationContentFactory();

    @ParameterizedTest
    @CsvSource({"LOW,baixa", "MEDIUM,média", "HIGH,alta"})
    void preservesTheOriginalMessageContentForEachPriority(RmaPriority priority, String label) {
        var content = factory.build(event(NotificationEventType.RMA_CREATED), rma(priority));
        assertEquals("Cliente · Produto · prioridade " + label + ". Aberta por admin.", content.message());
        assertEquals("Nova OS OS-2026-000001", content.title());
        assertEquals("/rmas?rma=1", content.actionPath());
    }

    @Test
    void keepsAssignmentContentWithoutAddingPriority() {
        var content = factory.build(event(NotificationEventType.RMA_ASSIGNED), rma(RmaPriority.HIGH));
        assertEquals("Cliente · Produto · etapa Recebida. Atribuída por admin.", content.message());
        assertFalse(content.message().contains("Prioridade"));
    }

    private RmaNotificationEvent event(NotificationEventType type) {
        return new RmaNotificationEvent(type, "content-test", 1L, Instant.parse("2026-11-12T12:00:00Z"), "admin");
    }

    private RmaRecord rma(RmaPriority priority) {
        Client client = new Client();
        client.setLegalName("Cliente");
        Product product = new Product();
        product.setName("Produto");
        RmaRecord rma = new RmaRecord();
        rma.setId(1L);
        rma.setCode("OS-2026-000001");
        rma.setClient(client);
        rma.setProduct(product);
        rma.setPriority(priority);
        return rma;
    }
}
