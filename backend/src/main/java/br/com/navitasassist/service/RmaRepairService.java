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
    private final AuditService audit;
    private final RmaRecordRepository rmas;
    private final PartRepository parts;
    private final RmaExternalComponentRepository externalComponents;
    private final RmaInterventionRepository interventions;

    @Transactional(readOnly = true)
    public RmaRepairResponse getRepair(Long rmaId) {
        requireRma(rmaId);
        List<InterventionResponse> records = interventions.findByRma_IdOrderByIdAsc(rmaId).stream().map(InterventionResponse::from).toList();
        return new RmaRepairResponse(records, records.stream().filter(item -> item.voidedAt() == null).map(InterventionResponse::hours).reduce(BigDecimal.ZERO, BigDecimal::add));
    }

    @Transactional(readOnly = true)
    public List<ExternalComponentResponse> listExternalComponents(Long rmaId) {
        requireRma(rmaId);
        return externalComponents.findByRma_IdOrderByIdAsc(rmaId).stream().map(ExternalComponentResponse::from).toList();
    }

    public ExternalComponentResponse addExternalComponent(Long rmaId, ExternalComponentRequest request) {
        RmaRecord rma = lockOpenRma(rmaId);
        RmaExternalComponent component = new RmaExternalComponent();
        component.setRma(rma);
        fillExternal(component, request);
        component.setAppliedAt(Instant.now());
        component.setAppliedBy(currentUsername());
        externalComponents.saveAndFlush(component);
        RmaRepairHistory.record(rma, "EXTERNAL_COMPONENT", component.getId(), "CREATE", "Componente fora do estoque: " + component.getDescription() + " · " + component.getQuantity() + " " + component.getUnit() + " · " + component.getReplacementReason() + batch(component.getComponentBatch()), currentUsername());
        return ExternalComponentResponse.from(component);
    }

    public InterventionResponse addIntervention(Long rmaId, InterventionRequest request) {
        RmaIntervention intervention = new RmaIntervention();
        intervention.setRma(lockOpenRma(rmaId));
        fillIntervention(intervention, request);
        intervention.setTechnicianName(currentUsername());
        interventions.saveAndFlush(intervention);
        RmaRepairHistory.record(intervention.getRma(), "INTERVENTION", intervention.getId(), "CREATE", "Intervenção registrada: " + intervention.getDescription() + " · " + intervention.getHours() + " h", currentUsername());
        return InterventionResponse.from(intervention);
    }

    public ExternalComponentResponse updateExternalComponent(Long rmaId, Long id, ExternalComponentRequest request) {
        RmaRecord rma = lockOpenRma(rmaId);
        RmaExternalComponent component = externalComponents.findById(id).filter(item -> item.getRma().getId().equals(rmaId))
            .orElseThrow(() -> new ResourceNotFoundException("Componente não encontrado nesta OS."));
        requireActive(component.getVoidedAt());
        fillExternal(component, request);
        component.setEditedBy(currentUsername()); component.setEditedAt(Instant.now());
        RmaRepairHistory.record(rma, "EXTERNAL_COMPONENT", id, "UPDATE", "Componente editado: " + component.getDescription() + " · " + component.getQuantity() + " " + component.getUnit() + " · " + component.getReplacementReason() + batch(component.getComponentBatch()), currentUsername());
        return ExternalComponentResponse.from(component);
    }

    public InterventionResponse updateIntervention(Long rmaId, Long id, InterventionRequest request) {
        RmaRecord rma = lockOpenRma(rmaId);
        RmaIntervention item = interventions.findById(id).filter(record -> record.getRma().getId().equals(rmaId))
            .orElseThrow(() -> new ResourceNotFoundException("Intervenção não encontrada nesta OS."));
        requireActive(item.getVoidedAt());
        fillIntervention(item, request);
        item.setEditedBy(currentUsername()); item.setEditedAt(Instant.now());
        RmaRepairHistory.record(rma, "INTERVENTION", id, "UPDATE", "Intervenção editada: " + item.getDescription() + " · " + item.getHours() + " h", currentUsername());
        return InterventionResponse.from(item);
    }

    public ExternalComponentResponse voidExternalComponent(Long rmaId, Long id, RepairVoidRequest request) {
        RmaRecord rma = lockOpenRma(rmaId);
        RmaExternalComponent item = externalComponents.findById(id).filter(record -> record.getRma().getId().equals(rmaId))
            .orElseThrow(() -> new ResourceNotFoundException("Componente não encontrado nesta OS."));
        requireActive(item.getVoidedAt());
        item.setVoidedBy(currentUsername()); item.setVoidedAt(Instant.now()); item.setVoidReason(request.reason().trim());
        RmaRepairHistory.record(rma, "EXTERNAL_COMPONENT", id, "VOID", "Componente anulado: " + item.getDescription() + " · Motivo: " + item.getVoidReason(), currentUsername());
        audit.record("REPAIR_VOID", "EXTERNAL_COMPONENT", id, rma.getCode(), "Reparo anulado. Consulte o histórico de reparo da OS #" + rmaId + ", registro #EXTERNAL_COMPONENT:" + id + ".");
        return ExternalComponentResponse.from(item);
    }

    public InterventionResponse voidIntervention(Long rmaId, Long id, RepairVoidRequest request) {
        RmaRecord rma = lockOpenRma(rmaId);
        RmaIntervention item = interventions.findById(id).filter(record -> record.getRma().getId().equals(rmaId))
            .orElseThrow(() -> new ResourceNotFoundException("Intervenção não encontrada nesta OS."));
        requireActive(item.getVoidedAt());
        item.setVoidedBy(currentUsername()); item.setVoidedAt(Instant.now()); item.setVoidReason(request.reason().trim());
        String description = item.getDescription().length() > 120 ? item.getDescription().substring(0, 120) + "…" : item.getDescription();
        RmaRepairHistory.record(rma, "INTERVENTION", id, "VOID", "Intervenção anulada: " + description + " · Motivo: " + item.getVoidReason(), currentUsername());
        audit.record("REPAIR_VOID", "INTERVENTION", id, rma.getCode(), "Reparo anulado. Consulte o histórico de reparo da OS #" + rmaId + ", registro #INTERVENTION:" + id + ".");
        return InterventionResponse.from(item);
    }

    private void fillExternal(RmaExternalComponent component, ExternalComponentRequest request) {
        String code = trimToNull(request.code());
        if (code != null && parts.existsByCodeIgnoreCase(code)) throw new BusinessException("Código já cadastrado no estoque. Use a reserva de peças.");
        component.setCode(code); component.setDescription(request.description().trim()); component.setQuantity(request.quantity());
        component.setUnit(trimToNull(request.unit()) == null ? "un" : request.unit().trim());
        component.setComponentBatch(trimToNull(request.componentBatch())); component.setReplacementReason(request.replacementReason().trim());
    }

    private void fillIntervention(RmaIntervention item, InterventionRequest request) {
        item.setType(request.type()); item.setDescription(request.description().trim()); item.setPerformedOn(request.performedOn()); item.setHours(request.hours());
    }

    private void requireActive(Instant voidedAt) {
        if (voidedAt != null) throw new BusinessException("Não é permitido alterar um registro anulado.");
    }
    private String batch(String value) { return value == null ? "" : " · Lote: " + value; }

    private void requireRma(Long rmaId) {
        if (!rmas.existsById(rmaId)) throw new ResourceNotFoundException("OS não encontrada: " + rmaId);
    }

    private RmaRecord lockOpenRma(Long rmaId) {
        RmaRecord rma = rmas.findByIdForUpdate(rmaId).orElseThrow(() -> new ResourceNotFoundException("OS não encontrada: " + rmaId));
        if (List.of(RmaStatus.COMPLETED, RmaStatus.RETURNED, RmaStatus.IRREPARABLE).contains(rma.getStatus())) {
            throw new BusinessException("Não é permitido registrar reparos em uma OS encerrada.");
        }
        return rma;
    }

    private String currentUsername() { return SecurityContextHolder.getContext().getAuthentication().getName(); }
    private String trimToNull(String value) { return value == null || value.isBlank() ? null : value.trim(); }
}
