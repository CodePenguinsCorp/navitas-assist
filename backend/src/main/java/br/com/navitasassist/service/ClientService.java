package br.com.navitasassist.service;

import java.util.List;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.client.ClientRequest;
import br.com.navitasassist.client.ClientResponse;
import br.com.navitasassist.controller.ResourceNotFoundException;
import br.com.navitasassist.repository.ClientRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class ClientService {

    private final ClientRepository clientRepository;

    @Transactional(readOnly = true)
    public List<ClientResponse> listAll() {
        return clientRepository.findAll().stream().map(ClientResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public ClientResponse getById(Long id) {
        return ClientResponse.from(getEntityById(id));
    }

    public ClientResponse create(ClientRequest request) {
        Client client = new Client();
        apply(client, request);
        return ClientResponse.from(clientRepository.save(client));
    }

    public ClientResponse update(Long id, ClientRequest request) {
        Client client = getEntityById(id);
        apply(client, request);
        return ClientResponse.from(clientRepository.save(client));
    }

    @Transactional(readOnly = true)
    public Client getEntityById(Long id) {
        return clientRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Client not found: " + id));
    }

    private void apply(Client client, ClientRequest request) {
        client.setLegalName(trim(request.legalName()));
        client.setTradeName(trim(request.tradeName()));
        client.setDocumentNumber(trim(request.documentNumber()));
        client.setContactName(trim(request.contactName()));
        client.setEmail(trim(request.email()));
        client.setPhone(trim(request.phone()));
        client.setAddress(trim(request.address()));
        client.setNotes(trim(request.notes()));
    }

    private String trim(String value) {
        return value == null ? null : value.trim();
    }
}
