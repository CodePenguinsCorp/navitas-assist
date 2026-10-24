package br.com.navitasassist.custody;

public record CustodySummaryResponse(
    long tracked,
    long missing,
    long stale
) {
}
