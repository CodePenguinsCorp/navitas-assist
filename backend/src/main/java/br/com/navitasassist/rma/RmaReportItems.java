package br.com.navitasassist.rma;

import java.util.List;

/** Itens da OS com a garantia efetiva apresentada pela API. */
public final class RmaReportItems {
    private RmaReportItems() {
    }

    public static List<RmaItemResponse> of(RmaRecord rma) {
        return rma.getItems().stream().map(RmaItemResponse::from).toList();
    }
}
