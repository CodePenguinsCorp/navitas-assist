package br.com.navitasassist.notification;

import static org.junit.jupiter.api.Assertions.*;
import br.com.navitasassist.service.NotificationContentFactory;
import br.com.navitasassist.client.Client;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.rma.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

class NotificationContentFactoryTest {
    private final NotificationContentFactory factory = new NotificationContentFactory();
    private final ObjectMapper json = new ObjectMapper();

    private RmaRecord rma() {
        var rma = new RmaRecord();
        var client = new Client(); client.setLegalName("Cliente");
        var product = new Product(); product.setName("Equipamento");
        rma.setClient(client); rma.setProduct(product); rma.setStatus(RmaStatus.IN_DIAGNOSIS);
        return rma;
    }

    @org.junit.jupiter.api.Test
    void rejectsContextThatCannotFitWithoutTruncation() {
        var rma = rma();
        rma.getClient().setLegalName("Cliente " + " ".repeat(600));
        assertThrows(IllegalArgumentException.class, () -> factory.build(
            new RmaNotificationEvent(NotificationEventType.RMA_BLOCKED, "key", 1L, null, "admin", "Motivo"), rma));
    }

    @ParameterizedTest
    @EnumSource(value = NotificationEventType.class, names = {"RMA_BLOCKED", "PART_PENDING", "TEST_FAILED"})
    void preservesContextAndEscapesDetailAndActor(NotificationEventType type) throws Exception {
        String detail = "Aguardando. Lote · 2\n\"peça\"";
        String actor = "admin. \"suporte\"";
        String label = switch (type) {
            case RMA_BLOCKED -> "Motivo do impedimento";
            case PART_PENDING -> "Pendência da peça";
            default -> "Item reprovado";
        };
        assertEquals("Cliente · Equipamento · etapa Diagnóstico. " + label + ": "
            + json.writeValueAsString(detail) + ". Registrado por " + json.writeValueAsString(actor) + ".",
            factory.build(new RmaNotificationEvent(type, "key", 1L, null, actor, detail), rma()).message());
        for (String absent : new String[]{null, "  "}) {
            String message = factory.build(new RmaNotificationEvent(type, "key", 1L, null, absent, " "), rma()).message();
            assertTrue(message.startsWith("Cliente · Equipamento · etapa Diagnóstico. " + label + ": \""));
            assertFalse(message.contains("Registrado por"));
            assertFalse(message.endsWith(": \"\"."));
        }
    }

    @ParameterizedTest
    @EnumSource(value = NotificationEventType.class, names = {"RMA_BLOCKED", "PART_PENDING", "TEST_FAILED"})
    void truncatesOnlyDetailAtCodePointBoundaries(NotificationEventType type) throws Exception {
        var rma = rma();
        rma.getClient().setLegalName("C".repeat(160));
        rma.getProduct().setName("P".repeat(120));
        String actor = "a".repeat(60);
        String message = factory.build(new RmaNotificationEvent(type, "key", 1L, null, actor, "😀\n\"".repeat(500)), rma).message();
        assertTrue(message.length() <= 500);
        assertTrue(message.startsWith("C".repeat(160) + " · " + "P".repeat(120)));
        assertTrue(message.endsWith(". Registrado por \"" + actor + "\"."));
        String encoded = message.substring(message.indexOf(": ") + 2, message.indexOf(". Registrado por"));
        String decoded = json.readValue(encoded, String.class);
        assertFalse(decoded.isEmpty());
        assertFalse(Character.isHighSurrogate(decoded.charAt(decoded.length() - 1)));
    }
}
