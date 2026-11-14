package br.com.navitasassist.service;

import java.util.Map;

import br.com.navitasassist.notification.RmaNotificationEvent;
import br.com.navitasassist.rma.RmaPriority;
import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.rma.RmaStatus;
import org.springframework.stereotype.Component;

/**
 * Builds the user-facing text (Portuguese, like the UI) and the internal route of a notification. Only internal routes
 * are produced; there are no public links.
 */
@Component
public class NotificationContentFactory {

    private static final Map<RmaStatus, String> STATUS_LABELS = Map.of(
        RmaStatus.RECEIVED, "Recebida",
        RmaStatus.TRIAGE, "Triagem",
        RmaStatus.IN_DIAGNOSIS, "Diagnóstico",
        RmaStatus.WAITING_PART, "Aguardando peça",
        RmaStatus.IN_REPAIR, "Reparo",
        RmaStatus.IN_TESTS, "Testes",
        RmaStatus.COMPLETED, "Concluída",
        RmaStatus.RETURNED, "Devolvida",
        RmaStatus.IRREPARABLE, "Sem conserto"
    );
    private static final Map<RmaPriority, String> PRIORITY_LABELS = Map.of(RmaPriority.HIGH, "alta", RmaPriority.MEDIUM, "média", RmaPriority.LOW, "baixa");

    public Content build(RmaNotificationEvent event, RmaRecord rma) {
        String context = rma.getClient().getLegalName() + " · " + rma.getProduct().getName();
        String assignee = rma.getAssignee() == null ? "sem responsável" : rma.getAssignee().getFullName();
        String stage = STATUS_LABELS.get(rma.getStatus());

        return switch (event.type()) {
            case RMA_CREATED -> new Content("Nova OS " + rma.getCode(), context + " · prioridade " + PRIORITY_LABELS.get(rma.getPriority()) + ". Aberta por " + event.actor() + ".", actionPath(rma));
            case RMA_ASSIGNED -> new Content("OS " + rma.getCode() + " atribuída a " + assignee, context + " · etapa " + stage + ". Atribuída por " + event.actor() + ".", actionPath(rma));
            case RMA_BLOCKED -> new Content("Impedimento na OS " + rma.getCode(), detail(event, "Impedimento aberto."), actionPath(rma));
            case PART_PENDING -> new Content("Peça pendente na OS " + rma.getCode(), detail(event, "Reserva pendente por falta de saldo."), actionPath(rma));
            case TEST_FAILED -> new Content("Teste reprovado na OS " + rma.getCode(), detail(event, "Item de protocolo reprovado."), actionPath(rma));
        };
    }

    private String detail(RmaNotificationEvent event, String fallback) {
        String detail = event.detail() == null || event.detail().isBlank() ? fallback : event.detail().trim();
        return detail.substring(0, Math.min(detail.length(), 500));
    }

    private String actionPath(RmaRecord rma) {
        return "/rmas?rma=" + rma.getId();
    }

    public record Content(String title, String message, String actionPath) {
    }
}
