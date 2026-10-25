package br.com.navitasassist.client;

import java.time.Instant;

public record ClientResponse(
    Long id,
    String legalName,
    String tradeName,
    String documentNumber,
    String email,
    String phone,
    String address,
    String notes,
    Instant createdAt,
    Instant updatedAt
) {
    public static ClientResponse from(Client client) {
        return new ClientResponse(
            client.getId(),
            client.getLegalName(),
            client.getTradeName(),
            client.getDocumentNumber(),
            client.getEmail(),
            client.getPhone(),
            client.getAddress(),
            client.getNotes(),
            client.getCreatedAt(),
            client.getUpdatedAt()
        );
    }
}
