package br.com.navitasassist.custody;

import java.time.Instant;

public record StorageLocationResponse(
    Long id,
    String code,
    String name,
    StorageLocationType type,
    Long parentId,
    String parentName,
    String description,
    boolean active,
    Instant createdAt,
    Instant updatedAt
) {
    public static StorageLocationResponse from(StorageLocation location) {
        StorageLocation parent = location.getParent();
        return new StorageLocationResponse(
            location.getId(),
            location.getCode(),
            location.getName(),
            location.getType(),
            parent == null ? null : parent.getId(),
            parent == null ? null : parent.getName(),
            location.getDescription(),
            location.isActive(),
            location.getCreatedAt(),
            location.getUpdatedAt()
        );
    }
}
