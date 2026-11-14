package br.com.navitasassist.rma;

import java.time.LocalDate;
import java.util.List;

import br.com.navitasassist.diagnosis.FailureType;

/** One RMA in the report list: the primary item plus the distinct effective warranty situations of all items. */
public record RmaReportRowResponse(
    Long id,
    String code,
    LocalDate entryDate,
    RmaStatus status,
    String clientName,
    String productName,
    String productSku,
    String serialNumber,
    String batchNumber,
    int itemCount,
    List<WarrantyStatus> warrantyStatuses,
    FailureType failureType
) {
    public static RmaReportRowResponse from(RmaRecord rma) {
        List<RmaItemResponse> items = RmaReportItems.of(rma);
        RmaItemResponse primary = items.get(0);
        return new RmaReportRowResponse(rma.getId(), rma.getCode(), rma.getEntryDate(), rma.getStatus(), rma.getClient().getLegalName(),
            primary.productName(), primary.productSku(), primary.serialNumber(), primary.batchNumber(), items.size(),
            items.stream().map(RmaItemResponse::warrantyStatus).distinct().toList(),
            rma.getDiagnosis() == null ? null : rma.getDiagnosis().getFailureType());
    }
}
