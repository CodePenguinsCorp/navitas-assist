package br.com.navitasassist.service;

import java.util.List;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.client.ClientRequest;
import br.com.navitasassist.client.ClientListItemResponse;
import br.com.navitasassist.client.ClientResponse;
import br.com.navitasassist.client.ClientOptionResponse;
import br.com.navitasassist.client.ClientSummaryResponse;
import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.controller.ResourceNotFoundException;
import br.com.navitasassist.pagination.PageParams;
import br.com.navitasassist.pagination.PageResponse;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class ClientService {
    private final AuditService audit;

    private final ClientRepository clientRepository;
    private final RmaRecordRepository rmaRecordRepository;

    @Transactional(readOnly = true)
    public PageResponse<ClientListItemResponse> search(
        String query,
        Boolean hasDocument,
        Boolean hasEmail,
        Integer page,
        Integer size
    ) {
        return PageResponse.from(
            clientRepository.search(blankToNull(query), hasDocument, hasEmail, PageParams.of(page, size)),
            ClientListItemResponse::from
        );
    }

    @Transactional(readOnly = true)
    public List<ClientOptionResponse> listOptions() {
        return clientRepository.findAllByOrderByLegalNameAscIdAsc().stream().map(ClientOptionResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public ClientSummaryResponse summarize() {
        return clientRepository.summarize();
    }

    @Transactional(readOnly = true)
    public ClientResponse getById(Long id) {
        return ClientResponse.from(getEntityById(id));
    }

    public ClientResponse create(ClientRequest request) {
        Client client = new Client();
        apply(client, request);
        clientRepository.save(client);
        audit.record("CREATE", "CLIENT", client.getId(), client.getLegalName(), "Registro criado.");
        return ClientResponse.from(client);
    }

    public ClientResponse update(Long id, ClientRequest request) {
        Client client = getEntityById(id);
        var before = ClientResponse.from(client);
        apply(client, request);
        clientRepository.save(client);
        audit.record("UPDATE", "CLIENT", client.getId(), client.getLegalName(), AuditService.changedFields(before, ClientResponse.from(client)));
        return ClientResponse.from(client);
    }

    public void delete(Long id) {
        Client client = getEntityById(id);

        if (rmaRecordRepository.existsByClient_Id(id)) {
            throw new BusinessException("Cliente não pode ser excluído porque está vinculado a uma OS.");
        }

        clientRepository.delete(client);
        audit.record("DELETE", "CLIENT", id, client.getLegalName(), "Registro excluído.");
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
        client.setEmail(trim(request.email()));
        client.setPhone(trim(request.phone()));
        client.setAddress(trim(request.address()));
        client.setNotes(trim(request.notes()));
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String trim(String value) {
        return value == null ? null : value.trim();
    }
}
