package br.com.navitasassist.rma;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * Card do Kanban ({@code GET /api/rmas/board}): o que o card, os filtros e a busca usam. Sem históricos completos nem
 * textos livres do detalhe; o tempo por etapa e o prazo já vêm calculados.
 */
public record RmaBoardCardResponse(
    Long id,
    String code,
    String clientName,
    List<RmaItemSummaryResponse> items,
    RmaStatus status,
    RmaPriority priority,
    LocalDate entryDate,
    LocalDate dueDate,
    RmaDeadlineResponse deadline,
    Instant updatedAt,
    Long assigneeId,
    String assigneeName,
    RmaBlockSummaryResponse currentBlock,
    List<RmaStagePeriodResponse> stagePeriods
) {
    public static RmaBoardCardResponse from(RmaRecord rma, List<RmaStagePeriodResponse> stagePeriods, RmaDeadlineResponse deadline) {
        return new RmaBoardCardResponse(
            rma.getId(),
            rma.getCode(),
            rma.getClient().getLegalName(),
            itemsOf(rma),
            rma.getStatus(),
            rma.getPriority(),
            rma.getEntryDate(),
            rma.getDueDate(),
            deadline,
            rma.getUpdatedAt(),
            rma.getAssignee() == null ? null : rma.getAssignee().getId(),
            rma.getAssignee() == null ? null : rma.getAssignee().getFullName(),
            RmaBlockSummaryResponse.from(rma.getBlockHistory().stream().filter(block -> block.getResolvedAt() == null).findFirst().orElse(null)),
            stagePeriods
        );
    }

    static List<RmaItemSummaryResponse> itemsOf(RmaRecord rma) {
        List<RmaItemResponse> items = rma.getItems().isEmpty()
            ? List.of(RmaItemResponse.fromLegacy(rma))
            : rma.getItems().stream().map(RmaItemResponse::from).toList();
        return items.stream().map(RmaItemSummaryResponse::from).toList();
    }
}
