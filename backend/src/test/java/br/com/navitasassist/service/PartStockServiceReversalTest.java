package br.com.navitasassist.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

import java.math.BigDecimal;
import java.util.Optional;
import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.part.*;
import br.com.navitasassist.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;

class PartStockServiceReversalTest {
    private final PartRepository parts = mock(PartRepository.class);
    private final PartMovementRepository movements = mock(PartMovementRepository.class);
    private final RmaRecordRepository rmas = mock(RmaRecordRepository.class);
    private final PartUsageRepository usages = mock(PartUsageRepository.class);
    private final AuditService audit = mock(AuditService.class);
    private final PartStockService service = new PartStockService(parts, movements,
        usages, rmas,
        audit, mock(RmaService.class));
    private final PartMovement original = new PartMovement();
    private final PartReversalRequest request = new PartReversalRequest("Correção");

    @BeforeEach
    void setup() {
        Part part = new Part();
        part.setId(4L); part.setOnHand(BigDecimal.TEN); original.setId(9L); original.setPart(part); original.setType(PartMovementType.ENTRY);
        original.setOnHandChange(BigDecimal.ONE); original.setUnitCost(BigDecimal.ONE);
        when(parts.findByIdForUpdate(4L)).thenReturn(Optional.of(part));
        when(movements.findById(9L)).thenReturn(Optional.of(original));
    }

    @Test
    void preservesTheOriginalAndReturnsTheStockOnReversal() {
        when(movements.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        PartMovementResponse response = service.reverse(9L, request);
        assertEquals(PartMovementType.REVERSAL, response.type());
        assertEquals(9L, response.reversedMovementId());
        assertEquals(new BigDecimal("9"), response.onHandAfter());
        assertEquals("Correção", response.reason());
        assertEquals(PartMovementType.ENTRY, original.getType());
        assertEquals(BigDecimal.ONE, original.getOnHandChange());
    }

    @Test
    void consumptionReversalReturnsStockAndRecordsUsageHistoryAndAudit() {
        var rma = new br.com.navitasassist.rma.RmaRecord();
        rma.setId(2L); rma.setStatus(br.com.navitasassist.rma.RmaStatus.IN_REPAIR);
        var usage = new PartUsage(); usage.setId(3L); usage.setStatus(PartUsageStatus.USED);
        original.setRma(rma); original.setUsage(usage); original.setType(PartMovementType.CONSUMPTION);
        original.setOnHandChange(new BigDecimal("-2"));
        when(rmas.findByIdForUpdate(2L)).thenReturn(Optional.of(rma));
        when(usages.findByIdForUpdate(3L)).thenReturn(Optional.of(usage));
        when(movements.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        var response = service.reverse(9L, new PartReversalRequest(" Correção "));
        assertEquals(new BigDecimal("12"), response.onHandAfter());
        assertEquals(PartUsageStatus.REVERTED, usage.getStatus());
        assertEquals(9L, response.reversedMovementId());
        assertEquals("Correção", response.reason());
        assertEquals(1, rma.getRepairHistory().size());
        assertEquals("REVERT", rma.getRepairHistory().get(0).getAction());
        verify(audit).record(eq("PART_REVERT"), eq("PART_MOVEMENT"), any(), any(), contains("Correção"));
    }

    @Test
    void rejectsBlankReversalReasonBeforeChangingStock() {
        assertThrows(BusinessException.class, () -> service.reverse(9L, new PartReversalRequest("  ")));
        verify(movements, never()).save(any());
        verify(parts, never()).save(any());
    }

    @Test
    void rejectsConsumptionReversalOnClosedOrder() {
        var rma = new br.com.navitasassist.rma.RmaRecord();
        rma.setId(2L); rma.setStatus(br.com.navitasassist.rma.RmaStatus.COMPLETED);
        when(rmas.findByIdForUpdate(2L)).thenReturn(Optional.of(rma));
        original.setRma(rma); original.setType(PartMovementType.CONSUMPTION);
        assertThrows(BusinessException.class, () -> service.reverse(9L, request));
        verify(movements, never()).save(any());
    }

    @Test
    void rejectsReversingAReversal() {
        original.setType(PartMovementType.REVERSAL);
        assertEquals("Reversões não podem ser revertidas.",
            assertThrows(BusinessException.class, () -> service.reverse(9L, request)).getMessage());
        verify(movements, never()).save(any());
    }

    @Test
    void rejectsAnAlreadyReversedMovement() {
        when(movements.existsByReversedMovement_Id(9L)).thenReturn(true);
        assertEquals("O movimento já foi revertido: 9",
            assertThrows(BusinessException.class, () -> service.reverse(9L, request)).getMessage());
        verify(movements, never()).save(any());
    }

    @Test
    void translatesTheConcurrentReversalConflict() {
        when(movements.save(any())).thenThrow(new DataIntegrityViolationException("duplicado"));
        assertEquals("O movimento já foi revertido: 9",
            assertThrows(BusinessException.class, () -> service.reverse(9L, request)).getMessage());
    }
}
