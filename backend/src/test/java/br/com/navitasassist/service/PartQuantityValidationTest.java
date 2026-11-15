package br.com.navitasassist.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.math.BigDecimal;
import java.util.Optional;
import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.part.*;
import br.com.navitasassist.repository.*;
import br.com.navitasassist.rma.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.context.ApplicationEventPublisher;

class PartQuantityValidationTest {
    private final PartRepository parts = mock(PartRepository.class);
    private final PartMovementRepository movements = mock(PartMovementRepository.class);
    private final PartUsageRepository usages = mock(PartUsageRepository.class);
    private final RmaRecordRepository rmas = mock(RmaRecordRepository.class);
    private final PartStockService stock = new PartStockService(parts, movements, usages, rmas,
        mock(AuditService.class), mock(RmaService.class));
    private final Part part = new Part();
    private final RmaRecord rma = new RmaRecord();

    private void setup(String unit) {
        part.setId(1L); part.setUnit(unit); part.setOnHand(BigDecimal.TEN);
        rma.setId(2L); rma.setStatus(RmaStatus.IN_REPAIR);
        when(parts.findByIdForUpdate(1L)).thenReturn(Optional.of(part));
        when(rmas.findByIdForUpdate(2L)).thenReturn(Optional.of(rma));
        when(movements.save(any())).thenAnswer(call -> call.getArgument(0));
        when(usages.save(any())).thenAnswer(call -> call.getArgument(0));
    }

    @ParameterizedTest
    @ValueSource(strings = {"ENTRY", "EXIT", "ADJUSTMENT"})
    void rejectsFractionInEveryManualMovement(String type) {
        setup("UN");
        var quantity = new BigDecimal(type.equals("ADJUSTMENT") ? "-1.5" : "1.5");
        var error = assertThrows(BusinessException.class, () -> stock.registerMovement(1L,
            new PartMovementRequest(PartMovementType.valueOf(type), quantity, "Inventário")));
        assertEquals("A unidade UN não aceita quantidade fracionada. Informe um número inteiro.", error.getMessage());
        verify(movements, never()).save(any());
        assertEquals(BigDecimal.TEN, part.getOnHand());
    }

    @Test
    void refusesInsufficientStockWithoutSavingOrPublishing() {
        setup("UN"); part.setCode("P1");
        var error = assertThrows(br.com.navitasassist.controller.ConflictException.class,
            () -> stock.use(2L, new PartUsageRequest(1L, new BigDecimal("11"), "Falha", null, null)));
        assertEquals("Estoque insuficiente para a peça P1. Em estoque: 10.", error.getMessage());
        verify(usages, never()).save(any()); verify(movements, never()).save(any());
        assertEquals(BigDecimal.TEN, part.getOnHand());
    }

    @Test
    void immediateUsageTrimsMetadataAndRecordsConsumption() {
        setup("UN");
        var usage = stock.use(2L, new PartUsageRequest(1L, BigDecimal.ONE, " Curto ", " L1 ", " Teste "));
        assertEquals(PartUsageStatus.USED, usage.status());
        assertEquals("Curto", usage.replacementReason()); assertEquals("L1", usage.componentBatch());
        assertEquals("Teste", usage.notes()); assertEquals(new BigDecimal("9"), part.getOnHand());
        verify(movements).save(argThat(m -> m.getType() == PartMovementType.CONSUMPTION
            && m.getOnHandChange().compareTo(BigDecimal.ONE.negate()) == 0));
        assertEquals(1, rma.getRepairHistory().size());
    }

    @Test
    void rejectsFractionInUsageEvenWithoutStock() {
        setup("UN"); part.setOnHand(BigDecimal.ZERO);
        assertThrows(BusinessException.class, () -> stock.use(2L, new PartUsageRequest(1L, new BigDecimal("3.5"), "Falha", null, null)));
        verify(usages, never()).save(any());
    }

    @org.junit.jupiter.api.AfterEach
    void clearAuthentication() { org.springframework.security.core.context.SecurityContextHolder.clearContext(); }

    @Test
    void rejectsFractionInExternalComponentCreationAndEdition() {
        setup("UN");
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
            new org.springframework.security.authentication.UsernamePasswordAuthenticationToken("teste", ""));
        var components = mock(RmaExternalComponentRepository.class);
        var service = new RmaRepairService(mock(AuditService.class), rmas, parts, components, mock(RmaInterventionRepository.class));
        var request = new ExternalComponentRequest(null, "Peça", new BigDecimal("1.222"), "UN", null, "Falha");
        assertThrows(BusinessException.class, () -> service.addExternalComponent(2L, request));
        var component = new RmaExternalComponent(); component.setRma(rma);
        when(components.findById(3L)).thenReturn(Optional.of(component));
        assertThrows(BusinessException.class, () -> service.updateExternalComponent(2L, 3L, request));
        verify(components, never()).saveAndFlush(any());
    }

    @Test
    void rejectsFractionalMinimumOnCreation() {
        var service = new PartService(parts);
        when(parts.save(any())).thenAnswer(call -> call.getArgument(0));
        assertThrows(BusinessException.class, () -> service.create(new PartRequest("P", "Peça", "UN", null,
            new BigDecimal("0.5"), BigDecimal.ONE, true)));
        verify(parts, never()).save(any());
    }

    @Test
    void preservesLegacyBalancesAndUnchangedMinimumWhenChangingUnit() {
        setup("m"); part.setMinimumStock(new BigDecimal("0.125")); part.setOnHand(new BigDecimal("3.5"));
        when(parts.save(any())).thenAnswer(call -> call.getArgument(0));
        var service = new PartService(parts);
        var response = service.update(1L, new PartRequest("P", "Peça", "UN", null,
            new BigDecimal("0.125"), BigDecimal.ONE, true));
        assertEquals("UN", response.unit());
        assertEquals(new BigDecimal("3.5"), response.onHand());
        assertEquals(new BigDecimal("0.125"), response.minimumStock());
        assertThrows(BusinessException.class, () -> service.update(1L, new PartRequest("P", "Peça", "UN", null,
            new BigDecimal("0.5"), BigDecimal.ONE, true)));
    }

    @ParameterizedTest
    @ValueSource(strings = {"UN", "kg"})
    void acceptsValidMovementsAndUsages(String unit) {
        setup(unit);
        var quantity = new BigDecimal(unit.equals("kg") ? "1.222" : "2.000");
        var movement = stock.registerMovement(1L, new PartMovementRequest(PartMovementType.ENTRY, quantity, null));
        assertEquals(quantity, movement.quantity());
        var usage = stock.use(2L, new PartUsageRequest(1L, quantity, "Falha", null, null));
        assertEquals(quantity, usage.quantity());
    }

    @Test
    void acceptsMeasureComponentAndDefaultsMissingUnitToCountable() {
        setup("UN");
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
            new org.springframework.security.authentication.UsernamePasswordAuthenticationToken("teste", ""));
        var components = mock(RmaExternalComponentRepository.class);
        var service = new RmaRepairService(mock(AuditService.class), rmas, parts, components, mock(RmaInterventionRepository.class));
        var response = service.addExternalComponent(2L,
            new ExternalComponentRequest(null, "Cabo", new BigDecimal("1.222"), "m", null, "Falha"));
        assertEquals(new BigDecimal("1.222"), response.quantity());
        assertThrows(BusinessException.class, () -> service.addExternalComponent(2L,
            new ExternalComponentRequest(null, "Cabo", new BigDecimal("1.222"), null, null, "Falha")));
    }
}
