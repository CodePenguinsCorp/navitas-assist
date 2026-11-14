package br.com.navitasassist.client;

public record ClientOptionResponse(Long id, String legalName) {
    public static ClientOptionResponse from(Client entity) {
        return new ClientOptionResponse(entity.getId(), entity.getLegalName());
    }
}
