package br.com.navitasassist.rma;

import java.time.LocalDate;
import java.util.List;

/** Linha da lista paginada de OS ({@code GET /api/rmas}): só as colunas da tabela; o detalhe vem de {@code GET /api/rmas/{id}}. */
public record RmaListItemResponse(
    Long id,
    String code,
    String clientName,
    List<RmaItemSummaryResponse> items,
    RmaStatus status,
    RmaPriority priority,
    LocalDate entryDate
) {
    public static RmaListItemResponse from(RmaRecord rma) {
        return new RmaListItemResponse(rma.getId(), rma.getCode(), rma.getClient().getLegalName(), RmaBoardCardResponse.itemsOf(rma),
            rma.getStatus(), rma.getPriority(), rma.getEntryDate());
    }
}
