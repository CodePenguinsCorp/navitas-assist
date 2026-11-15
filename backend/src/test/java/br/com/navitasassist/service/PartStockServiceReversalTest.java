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
    private final PartStockService service = new PartStockService(parts, movements,
        mock(PartReservationRepository.class), mock(RmaRecordRepository.class),
        mock(ApplicationEventPublisher.class), mock(RmaService.class));
    private final PartMovement original = new PartMovement();
    private final PartReversalRequest request = new PartReversalRequest("Correção");

    @BeforeEach
    void setup() {
        Part part = new Part();
        part.setId(4L); part.setOnHand(BigDecimal.TEN); part.setReserved(BigDecimal.ZERO);
        original.setId(9L); original.setPart(part); original.setType(PartMovementType.ENTRY);
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
        assertEquals(BigDecimal.ZERO, response.reservedAfter());
        assertEquals("Correção", response.reason());
        assertEquals(PartMovementType.ENTRY, original.getType());
        assertEquals(BigDecimal.ONE, original.getOnHandChange());
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
