package br.com.navitasassist.rma;

import java.util.List;

public record RmaBoardPageResponse(List<RmaBoardCardResponse> cards, long total, boolean hasMore, int page, int size) {}
