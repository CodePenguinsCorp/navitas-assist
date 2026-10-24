package br.com.navitasassist.protocol;

import java.time.Instant;
import java.util.List;
import java.util.Set;

import br.com.navitasassist.rma.RmaStatus;

public record ProtocolTemplateResponse(
    Long id,
    String name,
    Long productId,
    String productName,
    String category,
    boolean active,
    int currentVersion,
    Set<RmaStatus> blockedStatuses,
    List<ProtocolTemplateItemResponse> items,
    Instant updatedAt
) {
    public static ProtocolTemplateResponse from(ProtocolTemplate template) {
        ProtocolTemplateVersion version = template.latestVersion();
        return new ProtocolTemplateResponse(
            template.getId(),
            template.getName(),
            template.getProduct() == null ? null : template.getProduct().getId(),
            template.getProduct() == null ? null : template.getProduct().getName(),
            template.getCategory(),
            template.isActive(),
            template.getCurrentVersion(),
            version.blockedStatusSet(),
            version.getItems().stream().map(ProtocolTemplateItemResponse::from).toList(),
            template.getUpdatedAt()
        );
    }
}
