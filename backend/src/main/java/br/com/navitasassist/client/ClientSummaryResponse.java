package br.com.navitasassist.client;

public record ClientSummaryResponse(long total, long withContact, long withDocument, long withEmail) {
}
