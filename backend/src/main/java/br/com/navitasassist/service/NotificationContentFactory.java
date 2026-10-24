package br.com.navitasassist.service;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Map;

import br.com.navitasassist.notification.NotificationEventType;
import br.com.navitasassist.notification.RmaNotificationEvent;
import br.com.navitasassist.rma.RmaPriority;
import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.rma.RmaSlaResponse;
import br.com.navitasassist.rma.RmaStatus;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Builds the user-facing text (Portuguese, like the UI) and the internal route of a notification. Only internal routes
 * are produced; there are no public links.
 */
@Component
@RequiredArgsConstructor
public class NotificationContentFactory {

    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm").withZone(ZoneId.of("America/Sao_Paulo"));
    private static final Map<RmaStatus, String> STATUS_LABELS = Map.of(
        RmaStatus.RECEIVED, "Recebido",
        RmaStatus.TRIAGE, "Triagem",
        RmaStatus.IN_DIAGNOSIS, "Diagnóstico",
        RmaStatus.WAITING_PART, "Aguardando peça",
        RmaStatus.IN_REPAIR, "Reparo",
        RmaStatus.IN_TESTS, "Testes",
        RmaStatus.COMPLETED, "Concluído",
        RmaStatus.RETURNED, "Devolvido",
        RmaStatus.IRREPARABLE, "Sem conserto"
    );
    private static final Map<RmaPriority, String> PRIORITY_LABELS = Map.of(RmaPriority.HIGH, "alta", RmaPriority.MEDIUM, "média", RmaPriority.LOW, "baixa");

    private final RmaSlaService rmaSlaService;

    public Content build(RmaNotificationEvent event, RmaRecord rma) {
        String context = rma.getClient().getLegalName() + " · " + rma.getProduct().getName();
        String assignee = rma.getAssignee() == null ? "sem responsável" : rma.getAssignee().getFullName();
        String stage = STATUS_LABELS.get(rma.getStatus());

        return switch (event.type()) {
            case RMA_CREATED -> new Content("Novo RMA " + rma.getCode(), context + " · prioridade " + PRIORITY_LABELS.get(rma.getPriority()) + ". Aberto por " + event.actor() + ".", actionPath(rma));
            case RMA_ASSIGNED -> new Content("RMA " + rma.getCode() + " atribuído a " + assignee, context + " · etapa " + stage + ". Atribuído por " + event.actor() + ".", actionPath(rma));
            case SLA_WARNING -> new Content("SLA do RMA " + rma.getCode() + " perto do limite", context + " · etapa " + stage + " vence em " + dueAt(rma) + ". Responsável: " + assignee + ".", actionPath(rma));
            case SLA_OVERDUE -> new Content("SLA do RMA " + rma.getCode() + " vencido", context + " · etapa " + stage + " venceu em " + dueAt(rma) + ". Responsável: " + assignee + ".", actionPath(rma));
            default -> new Content(label(event.type()) + " no RMA " + rma.getCode(), context + " · etapa " + stage + ".", actionPath(rma));
        };
    }

    private String dueAt(RmaRecord rma) {
        RmaSlaResponse sla = rmaSlaService.calculate(rma, Instant.now());
        return sla.dueAt() == null ? "data não definida" : DATE_TIME.format(sla.dueAt());
    }

    private String actionPath(RmaRecord rma) {
        return "/rmas?rma=" + rma.getId();
    }

    private String label(NotificationEventType type) {
        return switch (type) {
            case RMA_BLOCKED -> "Bloqueio";
            case WIP_LIMIT_EXCEEDED -> "Limite de WIP excedido";
            case PART_PENDING -> "Peça pendente";
            case INTERNAL_APPROVAL_REQUIRED -> "Aprovação interna pendente";
            case TEST_FAILED -> "Falha de teste";
            case RECURRENCE_DETECTED -> "Recorrência";
            default -> "Evento";
        };
    }

    public record Content(String title, String message, String actionPath) {
    }
}
