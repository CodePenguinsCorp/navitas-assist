package br.com.navitasassist.client;

public record ClientSummaryResponse(long total, long withPhone, long withDocument, long withEmail) {
}
