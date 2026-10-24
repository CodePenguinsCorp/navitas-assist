package br.com.navitasassist.protocol;

import java.util.List;

public record ProtocolExecutionItemResponse(
    ProtocolTemplateItemResponse item,
    ProtocolItemResultResponse latest,
    List<ProtocolItemResultResponse> attempts
) {
}
