package br.com.navitasassist.notification;

import static org.junit.jupiter.api.Assertions.*;
import br.com.navitasassist.config.NotificationProperties;
import br.com.navitasassist.service.NotificationEmailContentFactory;
import br.com.navitasassist.notification.email.EmailDeliveryException;
import br.com.navitasassist.rma.RmaRecord;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class NotificationEmailContentFactoryTest {
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.EnumSource(NotificationEventType.class)
    void rendersPortugueseSafeHtmlWithoutClientDetailsWithStableLink(NotificationEventType type) {
        NotificationProperties properties = new NotificationProperties();
        properties.getEmail().setFrom("from@example.invalid");
        properties.getEmail().setAppBaseUrl("http://localhost:4200");
        Notification n = new Notification();
        n.setEventType(type);
        n.setCreatedAt(Instant.parse("2026-11-13T12:00:00Z"));
        n.setMessage("Secret client name");
        RmaRecord rma = new RmaRecord();
        rma.setId(42L);
        rma.setCode("OS<&\"42");
        n.setRma(rma);
        var factory = new NotificationEmailContentFactory(properties);
        var message = factory.build(n, "to@example.invalid");
        String label = switch (type) {
            case RMA_CREATED -> "OS criada";
            case RMA_ASSIGNED -> "OS atribuída";
            case RMA_BLOCKED -> "Impedimento aberto";
            case PART_PENDING -> "Peça pendente";
            case TEST_FAILED -> "Teste reprovado";
        };
        assertTrue(message.subject().startsWith("[Navitas Assist] " + label));
        assertTrue(message.text().contains(label));
        assertFalse(message.text().contains("Secret client"));
        assertTrue(message.html().contains("OS&lt;&amp;&quot;42"));
        assertTrue(message.text().contains("http://localhost:4200/rmas?rma=42"));
        assertFalse(message.html().contains("Secret client"));
        assertEquals(message, factory.build(n, "to@example.invalid"));
        rma.setCode("bad\r\ncode");
        assertThrows(EmailDeliveryException.class, () -> factory.build(n, "to@example.invalid"));
    }
}
