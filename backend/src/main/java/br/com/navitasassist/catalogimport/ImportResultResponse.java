package br.com.navitasassist.catalogimport;

public record ImportResultResponse(int importedRows, int ignoredInvalidRows, int ignoredDuplicateRows) {}
