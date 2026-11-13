package br.com.navitasassist.rma;

import java.util.List;

/** Items as the API shows them (legacy RMAs without rma_items expose their single product), with effective warranty. */
public final class RmaReportItems {
    private RmaReportItems() {
    }

    public static List<RmaItemResponse> of(RmaRecord rma) {
        return rma.getItems().isEmpty() ? List.of(RmaItemResponse.fromLegacy(rma)) : rma.getItems().stream().map(RmaItemResponse::from).toList();
    }
}
