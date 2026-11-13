package br.com.navitasassist.rma;

import java.util.EnumMap;
import java.util.Map;

import br.com.navitasassist.diagnosis.FailureCause;
import br.com.navitasassist.diagnosis.FailureType;

/** Portuguese labels for the report summary, the CSV exports and the PDF, matching the frontend labels. */
public final class ReportLabels {
    private static final Map<RmaStatus, String> STATUS = new EnumMap<>(Map.of(
        RmaStatus.RECEIVED, "Recebido", RmaStatus.TRIAGE, "Triagem", RmaStatus.IN_DIAGNOSIS, "Diagnóstico",
        RmaStatus.WAITING_PART, "Aguardando peça", RmaStatus.IN_REPAIR, "Reparo", RmaStatus.IN_TESTS, "Testes",
        RmaStatus.COMPLETED, "Concluído", RmaStatus.RETURNED, "Devolvido", RmaStatus.IRREPARABLE, "Sem conserto"));
    private static final Map<WarrantyStatus, String> WARRANTY = new EnumMap<>(Map.of(
        WarrantyStatus.PENDING, "Pendente", WarrantyStatus.IN_WARRANTY, "Em garantia", WarrantyStatus.OUT_OF_WARRANTY, "Fora de garantia"));
    private static final Map<FailureType, String> FAILURE_TYPE = new EnumMap<>(Map.of(
        FailureType.POWER_SUPPLY, "Fonte", FailureType.PWM, "PWM", FailureType.SENSOR, "Sensor", FailureType.COMMUNICATION, "Comunicação",
        FailureType.DISPLAY, "Display", FailureType.FIRMWARE, "Firmware", FailureType.MECHANICAL, "Mecânica", FailureType.OTHER, "Outro"));
    private static final Map<FailureCause, String> FAILURE_CAUSE = new EnumMap<>(Map.of(
        FailureCause.COMPONENT, "Componente", FailureCause.SOLDER, "Solda", FailureCause.HUMIDITY, "Umidade", FailureCause.OVERLOAD, "Sobrecarga",
        FailureCause.ESD, "ESD", FailureCause.INCORRECT_USAGE, "Uso incorreto", FailureCause.OTHER, "Outro"));

    private ReportLabels() {
    }

    public static String status(RmaStatus status) {
        return status == null ? "" : STATUS.get(status);
    }

    public static String warranty(WarrantyStatus status) {
        return status == null ? "" : WARRANTY.get(status);
    }

    public static String failureType(FailureType type) {
        return type == null ? "" : FAILURE_TYPE.get(type);
    }

    public static String failureCause(FailureCause cause) {
        return cause == null ? "" : FAILURE_CAUSE.get(cause);
    }
}
