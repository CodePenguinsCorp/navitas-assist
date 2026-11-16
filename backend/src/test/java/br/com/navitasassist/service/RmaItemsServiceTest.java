package br.com.navitasassist.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static br.com.navitasassist.support.RmaTestSupport.addItem;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.rma.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class RmaItemsServiceTest {
    @Mock RmaRecordRepository repository;
    @Mock ClientService clients;
    @Mock ProductService products;
    @Mock RmaStageTimeService stages;
    @Mock RmaDeadlineService deadlines;
    @InjectMocks RmaService service;
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();

    @Test
    void creationRequiresAtLeastOneItem() {
        when(clients.getEntityById(1L)).thenReturn(new Client());
        for (var payload : List.of(Map.of("clientId", 1L), Map.of("clientId", 1L, "items", List.of()))) {
            var request = json.convertValue(payload, CreateRmaRequest.class);
            assertEquals("Informe pelo menos um produto.", assertThrows(BusinessException.class, () -> service.create(request)).getMessage());
        }
        verify(repository, never()).save(any());
    }

    @Test
    void editingCannotRemoveAllItems() {
        var rma = identifiedOrder();
        when(repository.findByIdForUpdate(1L)).thenReturn(Optional.of(rma));
        var request = json.convertValue(Map.of("items", List.of()), UpdateRmaRequest.class);
        assertEquals("Informe pelo menos um produto.", assertThrows(BusinessException.class, () -> service.update(1L, request)).getMessage());
        assertEquals(1, rma.getItems().size());
        verify(repository, never()).save(any());
    }

    @Test
    void editingWithoutItemsPreservesItemAndWarrantyHistory() {
        var rma = identifiedOrder();
        var item = rma.getItems().get(0);
        var history = new RmaItemWarrantyHistory();
        history.setChangedAt(java.time.Instant.parse("2026-01-01T12:00:00Z"));
        item.addWarrantyHistory(history);
        when(repository.findByIdForUpdate(1L)).thenReturn(Optional.of(rma));
        when(repository.save(any())).thenAnswer(call -> call.getArgument(0));
        var response = service.update(1L, json.convertValue(Map.of("priority", "HIGH"), UpdateRmaRequest.class));
        assertSame(item, rma.getItems().get(0));
        assertEquals(1, response.items().size());
        assertEquals(1, response.warrantyHistory().size());
        assertEquals(RmaPriority.HIGH, response.priority());
    }

    @Test
    void editingValidatesManufactureDateOfEveryItem() {
        var rma = identifiedOrder();
        addItem(rma, rma.getItems().get(0).getProduct()).getItemIdentification().setManufacturedAt(LocalDate.of(2099, 1, 1));
        when(repository.findByIdForUpdate(1L)).thenReturn(Optional.of(rma));
        var request = json.convertValue(Map.of("reportedFailure", "Falha atualizada"), UpdateRmaRequest.class);
        assertEquals("A data de fabricação não pode ser posterior a hoje.", assertThrows(BusinessException.class, () -> service.update(1L, request)).getMessage());
        verify(repository, never()).save(any());
    }

    private RmaRecord identifiedOrder() {
        var rma = new RmaRecord();
        rma.setId(1L);
        rma.setClient(new Client());
        rma.setEntryDate(LocalDate.of(2026, 1, 1));
        rma.setPurchaseDateUnknown(true);
        rma.setReceivedBy("recepção");
        rma.setReportedFailure("Falha");
        var product = new Product();
        product.setDefaultWarrantyMonths(12);
        addItem(rma, product).setId(10L);
        return rma;
    }
}
