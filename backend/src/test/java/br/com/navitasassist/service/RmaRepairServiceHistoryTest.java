package br.com.navitasassist.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;
import br.com.navitasassist.repository.*;
import br.com.navitasassist.rma.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

class RmaRepairServiceHistoryTest {
    private final RmaRecordRepository rmas = mock(RmaRecordRepository.class);
    private final RmaExternalComponentRepository components = mock(RmaExternalComponentRepository.class);
    private final RmaInterventionRepository interventions = mock(RmaInterventionRepository.class);
    private final RmaRepairService service = new RmaRepairService(mock(AuditService.class), rmas,
        mock(PartRepository.class), components, interventions);
    private final RmaRecord rma = new RmaRecord();

    @BeforeEach
    void setup() {
        rma.setId(7L); rma.setStatus(RmaStatus.IN_REPAIR);
        when(rmas.findByIdForUpdate(7L)).thenReturn(Optional.of(rma));
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("ana", ""));
    }

    @AfterEach
    void clearAuthentication() { SecurityContextHolder.clearContext(); }

    @Test
    void labelsComponentFieldsOnCreationEditionAndVoid() {
        var request = new ExternalComponentRequest(null, "Cabo X", new BigDecimal("2.000"), "un", "123", "queimado");
        service.addExternalComponent(7L, request);
        assertEquals("Componente fora do estoque: Cabo X, 2 un. Motivo da troca: queimado. Lote: 123.", lastSummary());
        var item = new RmaExternalComponent(); item.setId(8L); item.setRma(rma);
        when(components.findById(8L)).thenReturn(Optional.of(item));
        service.updateExternalComponent(7L, 8L, new ExternalComponentRequest(null, "Cabo X", new BigDecimal("1.125"), "un", " ", "falha"));
        assertEquals("Componente editado: Cabo X, 1,125 un. Motivo da troca: falha.", lastSummary());
        service.voidExternalComponent(7L, 8L, new RepairVoidRequest("duplicado"));
        assertEquals("Componente anulado: Cabo X. Motivo: duplicado.", lastSummary());
    }

    @Test
    void showsInterventionHoursInPortugueseAndLabelsVoidReason() {
        var request = new InterventionRequest(InterventionType.CLEANING, "Limpeza", LocalDate.now(), new BigDecimal("1.500"));
        service.addIntervention(7L, request);
        assertEquals("Intervenção registrada: Limpeza (1,5 h).", lastSummary());
        var item = new RmaIntervention(); item.setId(8L); item.setRma(rma);
        when(interventions.findById(8L)).thenReturn(Optional.of(item));
        service.updateIntervention(7L, 8L, request);
        assertEquals("Intervenção editada: Limpeza (1,5 h).", lastSummary());
        service.voidIntervention(7L, 8L, new RepairVoidRequest("duplicada"));
        assertEquals("Intervenção anulada: Limpeza. Motivo: duplicada.", lastSummary());
    }

    private String lastSummary() { return rma.getRepairHistory().get(rma.getRepairHistory().size() - 1).getSummary(); }
}
