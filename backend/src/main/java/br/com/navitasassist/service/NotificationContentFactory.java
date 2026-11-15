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
            case RMA_BLOCKED -> new Content("Impedimento na OS " + rma.getCode(), operationalMessage(event, context, stage, "Motivo do impedimento", "Impedimento aberto."), actionPath(rma));
            case TEST_FAILED -> new Content("Teste reprovado na OS " + rma.getCode(), operationalMessage(event, context, stage, "Item reprovado", "Item de protocolo reprovado."), actionPath(rma));
        };
    }

    private String operationalMessage(RmaNotificationEvent event, String context, String stage, String label, String fallback) {
        String prefix = context + " · etapa " + stage + ". " + label + ": ";
        String suffix = event.actor() == null || event.actor().isBlank()
            ? "." : ". Registrado por " + quote(event.actor()) + ".";
        String reason = event.detail() == null || event.detail().isBlank() ? fallback : event.detail().trim();
        int end = reason.length();
        while (prefix.length() + quote(reason.substring(0, end)).length() + suffix.length() > 500 && end > 0) {
            end = reason.offsetByCodePoints(end, -1);
        }
        if (prefix.length() + 2 + suffix.length() > 500) {
            throw new IllegalArgumentException("Contexto da notificação excede 500 caracteres.");
        }
        return prefix + quote(reason.substring(0, end)) + suffix;
    }

    private String quote(String value) {
        return "\"" + new String(com.fasterxml.jackson.core.io.JsonStringEncoder.getInstance().quoteAsString(value)) + "\"";
    }

    private String actionPath(RmaRecord rma) {
        return "/rmas?rma=" + rma.getId();
    }

    public record Content(String title, String message, String actionPath) {
    }
}
