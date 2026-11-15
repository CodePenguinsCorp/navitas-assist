package br.com.navitasassist.rma;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Card do Kanban ({@code GET /api/rmas/board}): só o que o card exibe e o que os filtros e a busca do quadro usam.
 * Itens completos, períodos por etapa, impedimento e prazo detalhados vêm do detalhe ({@code GET /api/rmas/{id}}).
 * {@code searchText} reúne SKU, lote e série de todos os itens e o nome dos itens além do primeiro, para a busca local;
 * {@code warranty} traz as garantias efetivas distintas em uma letra cada (P pendente, I em garantia, O fora de garantia)
 * para o filtro; {@code dueSoonFrom} deixa o cliente recalcular a situação do prazo quando o dia vira. Campos que quase
 * sempre seriam nulos ({@code additionalItems}, {@code blockedAt}) saem do JSON quando ausentes, para o payload ficar curto.
 */
public record RmaBoardCardResponse(
    Long id,
    String code,
    String clientName,
    String productName,
    @JsonInclude(JsonInclude.Include.NON_NULL) Integer additionalItems,
    String searchText,
    String warranty,
    RmaStatus status,
    RmaPriority priority,
    LocalDate entryDate,
    LocalDate dueDate,
    LocalDate dueSoonFrom,
    Instant updatedAt,
    Long assigneeId,
    String assigneeName,
    @JsonInclude(JsonInclude.Include.NON_NULL) Instant blockedAt,
    Instant currentStageEnteredAt
) {
    public static RmaBoardCardResponse from(RmaRecord rma, LocalDate dueSoonFrom, Instant blockedAt, Instant currentStageEnteredAt) {
        List<RmaItemSummaryResponse> items = itemsOf(rma);
        List<String> terms = new ArrayList<>();
        for (int index = 0; index < items.size(); index++) {
            RmaItemSummaryResponse item = items.get(index);
            Stream<String> values = index == 0
                ? Stream.of(item.productSku(), item.batchNumber(), item.serialNumber())
                : Stream.of(item.productName(), item.productSku(), item.batchNumber(), item.serialNumber());
            values.filter(value -> value != null && !value.isBlank()).forEach(terms::add);
        }
        return new RmaBoardCardResponse(
            rma.getId(),
            rma.getCode(),
            rma.getClient().getLegalName(),
            items.isEmpty() ? "" : items.get(0).productName(),
            items.size() > 1 ? items.size() - 1 : null,
            String.join(" ", terms),
            items.stream().map(item -> warrantyCode(item.warrantyStatus())).distinct().collect(Collectors.joining()),
            rma.getStatus(),
            rma.getPriority(),
            rma.getEntryDate(),
            rma.getDueDate(),
            dueSoonFrom,
            rma.getUpdatedAt() == null ? null : rma.getUpdatedAt().truncatedTo(ChronoUnit.SECONDS),
            rma.getAssignee() == null ? null : rma.getAssignee().getId(),
            rma.getAssignee() == null ? null : rma.getAssignee().getFullName(),
            blockedAt,
            currentStageEnteredAt == null ? null : currentStageEnteredAt.truncatedTo(ChronoUnit.SECONDS)
        );
    }

    /** P pendente, I em garantia, O fora de garantia: o filtro de garantia do Kanban compara com esta letra. */
    static String warrantyCode(WarrantyStatus status) {
        return switch (status) {
            case PENDING -> "P";
            case IN_WARRANTY -> "I";
            case OUT_OF_WARRANTY -> "O";
        };
    }

    static List<RmaItemSummaryResponse> itemsOf(RmaRecord rma) {
        List<RmaItemResponse> items = rma.getItems().isEmpty()
            ? List.of(RmaItemResponse.fromLegacy(rma))
            : rma.getItems().stream().map(RmaItemResponse::from).toList();
        return items.stream().map(RmaItemSummaryResponse::from).toList();
    }
}
