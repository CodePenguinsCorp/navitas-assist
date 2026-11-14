package br.com.navitasassist.client;

import java.time.Instant;

/** Linha da lista de clientes: sem endereço nem observações, que a edição lê em {@code GET /api/clients/{id}}. */
public record ClientListItemResponse(
    Long id,
    String legalName,
    String tradeName,
    String documentNumber,
    String email,
    String phone,
    Instant updatedAt
) {
    public static ClientListItemResponse from(Client client) {
        return new ClientListItemResponse(client.getId(), client.getLegalName(), client.getTradeName(), client.getDocumentNumber(),
            client.getEmail(), client.getPhone(), client.getUpdatedAt());
    }
}
