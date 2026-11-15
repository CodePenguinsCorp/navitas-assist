package br.com.navitasassist.rma;

import java.util.EnumMap;
import java.util.Map;


/** Portuguese labels for the report summary, the CSV exports and the PDF, matching the frontend labels. */
public final class ReportLabels {
    private static final Map<RmaStatus, String> STATUS = new EnumMap<>(Map.of(
        RmaStatus.RECEIVED, "Recebida", RmaStatus.TRIAGE, "Triagem", RmaStatus.IN_DIAGNOSIS, "Diagnóstico",
        RmaStatus.WAITING_PART, "Aguardando peça", RmaStatus.IN_REPAIR, "Reparo", RmaStatus.IN_TESTS, "Testes",
        RmaStatus.COMPLETED, "Concluída", RmaStatus.RETURNED, "Devolvida", RmaStatus.IRREPARABLE, "Sem conserto"));
    private static final Map<WarrantyStatus, String> WARRANTY = new EnumMap<>(Map.of(
        WarrantyStatus.PENDING, "Pendente", WarrantyStatus.IN_WARRANTY, "Em garantia", WarrantyStatus.OUT_OF_WARRANTY, "Fora de garantia"));

    private ReportLabels() {
    }

    public static String status(RmaStatus status) {
        return status == null ? "" : STATUS.get(status);
    }

    public static String warranty(WarrantyStatus status) {
        return status == null ? "" : WARRANTY.get(status);
    }
}
