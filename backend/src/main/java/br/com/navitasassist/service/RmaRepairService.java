package br.com.navitasassist.service;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.controller.ResourceNotFoundException;
import br.com.navitasassist.repository.*;
import br.com.navitasassist.rma.*;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class RmaRepairService {
    private final RmaRecordRepository rmas;
    private final PartRepository parts;
    private final RmaExternalComponentRepository externalComponents;
    private final RmaInterventionRepository interventions;

    @Transactional(readOnly = true)
    public RmaRepairResponse getRepair(Long rmaId) {
        requireRma(rmaId);
        List<InterventionResponse> records = interventions.findByRma_IdOrderByIdAsc(rmaId).stream().map(InterventionResponse::from).toList();
        return new RmaRepairResponse(records, records.stream().map(InterventionResponse::hours).reduce(BigDecimal.ZERO, BigDecimal::add));
    }

    @Transactional(readOnly = true)
    public List<ExternalComponentResponse> listExternalComponents(Long rmaId) {
        requireRma(rmaId);
        return externalComponents.findByRma_IdOrderByIdAsc(rmaId).stream().map(ExternalComponentResponse::from).toList();
    }

    public ExternalComponentResponse addExternalComponent(Long rmaId, ExternalComponentRequest request) {
        RmaRecord rma = lockOpenRma(rmaId);
        String code = trimToNull(request.code());
        if (code != null && parts.existsByCodeIgnoreCase(code)) {
            throw new BusinessException("Código já cadastrado no estoque. Use a reserva de peças.");
        }
        RmaExternalComponent component = new RmaExternalComponent();
        component.setRma(rma);
        component.setCode(code);
        component.setDescription(request.description().trim());
        component.setQuantity(request.quantity());
        component.setUnit(trimToNull(request.unit()) == null ? "un" : request.unit().trim());
        component.setComponentBatch(trimToNull(request.componentBatch()));
        component.setReplacementReason(request.replacementReason().trim());
        component.setAppliedAt(Instant.now());
        component.setAppliedBy(currentUsername());
        return ExternalComponentResponse.from(externalComponents.save(component));
    }

    public InterventionResponse addIntervention(Long rmaId, InterventionRequest request) {
        RmaIntervention intervention = new RmaIntervention();
        intervention.setRma(lockOpenRma(rmaId));
        intervention.setType(request.type());
        intervention.setDescription(request.description().trim());
        intervention.setPerformedOn(request.performedOn());
        intervention.setHours(request.hours());
        intervention.setTechnicianName(currentUsername());
        return InterventionResponse.from(interventions.save(intervention));
    }

    private void requireRma(Long rmaId) {
        if (!rmas.existsById(rmaId)) throw new ResourceNotFoundException("RMA não encontrado: " + rmaId);
    }

    private RmaRecord lockOpenRma(Long rmaId) {
        RmaRecord rma = rmas.findByIdForUpdate(rmaId).orElseThrow(() -> new ResourceNotFoundException("RMA não encontrado: " + rmaId));
        if (List.of(RmaStatus.COMPLETED, RmaStatus.RETURNED, RmaStatus.IRREPARABLE).contains(rma.getStatus())) {
            throw new BusinessException("Não é permitido registrar reparos em um RMA encerrado.");
        }
        return rma;
    }

    private String currentUsername() { return SecurityContextHolder.getContext().getAuthentication().getName(); }
    private String trimToNull(String value) { return value == null || value.isBlank() ? null : value.trim(); }
}
