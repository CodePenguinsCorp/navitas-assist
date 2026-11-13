package br.com.navitasassist.rma;

// String allows the service to reject unsupported statuses with a Portuguese business error.
public record RmaItemWarrantyRequest(String override, String reason) {
}
