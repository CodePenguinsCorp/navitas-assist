package br.com.navitasassist.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.controller.ResourceNotFoundException;
import br.com.navitasassist.part.Part;
import br.com.navitasassist.part.QuantityRules;
import br.com.navitasassist.part.PartMovement;
import br.com.navitasassist.part.PartMovementRequest;
import br.com.navitasassist.part.PartMovementResponse;
import br.com.navitasassist.part.PartMovementType;
import br.com.navitasassist.part.PartReplenishmentResponse;
import br.com.navitasassist.part.PartUsage;
import br.com.navitasassist.part.PartUsageRequest;
import br.com.navitasassist.part.PartUsageResponse;
import br.com.navitasassist.part.PartUsageStatus;
import br.com.navitasassist.part.PartReversalRequest;
import br.com.navitasassist.part.RmaPartsResponse;
import br.com.navitasassist.repository.PartMovementRepository;
import br.com.navitasassist.repository.PartRepository;
import br.com.navitasassist.repository.PartUsageRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.rma.RmaStatus;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Stock balances live on the part row and change only here, always under a pessimistic lock on that row, and always
 * together with an immutable {@link PartMovement}. Lock order is RMA, then part, then usage.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class PartStockService {

    private static final Set<PartMovementType> MANUAL_TYPES = EnumSet.of(PartMovementType.ENTRY, PartMovementType.EXIT, PartMovementType.ADJUSTMENT);
    private static final Set<RmaStatus> CLOSED_RMA_STATUSES = EnumSet.of(RmaStatus.COMPLETED, RmaStatus.RETURNED, RmaStatus.IRREPARABLE);

    private final PartRepository partRepository;
    private final PartMovementRepository partMovementRepository;
    private final PartUsageRepository partUsageRepository;
    private final RmaRecordRepository rmaRecordRepository;
    private final AuditService audit;
    private final RmaService rmaService;

    @Transactional(readOnly = true)
    public List<PartMovementResponse> listMovements(Long partId) {
        ensurePartExists(partId);
        Set<Long> reversedIds = new HashSet<>(partMovementRepository.findReversedMovementIdsByPartId(partId));
        return partMovementRepository.findByPart_IdOrderByIdDesc(partId).stream().map(movement -> PartMovementResponse.from(movement, reversedIds.contains(movement.getId()))).toList();
    }

    public PartMovementResponse registerMovement(Long partId, PartMovementRequest request) {
        if (!MANUAL_TYPES.contains(request.type())) {
            throw new BusinessException("Somente movimentos de entrada, saída e ajuste podem ser registrados manualmente.");
        }

        BigDecimal quantity = request.quantity();
        String reason = trimToNull(request.reason());
        BigDecimal onHandChange = switch (request.type()) {
            case ENTRY -> requirePositive(quantity);
            case EXIT -> requirePositive(quantity).negate();
            default -> {
                if (quantity.signum() == 0) {
                    throw new BusinessException("A quantidade do ajuste não pode ser zero.");
                }
                if (reason == null) {
                    throw new BusinessException("Informe o motivo do ajuste de estoque.");
                }
                yield quantity;
            }
        };

        Part part = lockPart(partId);
        QuantityRules.validate(quantity.abs(), part.getUnit());
        PartMovement movement = record(part, request.type(), onHandChange, part.getUnitCost(), null, null, null, reason);
        return PartMovementResponse.from(movement, false);
    }

    public PartMovementResponse reverse(Long movementId, PartReversalRequest request) {
        PartMovement snapshot = partMovementRepository.findById(movementId)
            .orElseThrow(() -> new ResourceNotFoundException("Movimento não encontrado: " + movementId));
        Long partId = snapshot.getPart().getId();
        if (snapshot.getType() == PartMovementType.CONSUMPTION && snapshot.getRma() != null) {
            lockOpenRma(snapshot.getRma().getId(), "Não é permitido desfazer o uso de peças em uma OS encerrada.");
        }
        if (trimToNull(request.reason()) == null) throw new BusinessException("Informe o motivo da reversão.");
        Part part = lockPart(partId);
        PartMovement original = partMovementRepository.findById(movementId).orElseThrow();

        if (original.getType() == PartMovementType.REVERSAL) {
            throw new BusinessException("Reversões não podem ser revertidas.");
        }
        if (partMovementRepository.existsByReversedMovement_Id(movementId)) {
            throw new BusinessException("O movimento já foi revertido: " + movementId);
        }

        // A reversed consumption returns the quantity to free stock; the usage is closed as REVERTED.
        PartUsage usage = original.getUsage();
        if (original.getType() == PartMovementType.CONSUMPTION && usage != null) {
            usage = lockUsage(usage.getId());
            usage.setStatus(PartUsageStatus.REVERTED);
        }

        if (original.getType() == PartMovementType.CONSUMPTION && original.getRma() != null) {
            br.com.navitasassist.rma.RmaRepairHistory.record(original.getRma(), "STOCK_COMPONENT", usage == null ? null : usage.getId(), "REVERT",
                "Uso desfeito: " + part.getName() + " (código: " + part.getCode() + "). Motivo: " + request.reason().trim(), currentUsername());
        }
        try {
            PartMovement movement = record(part, PartMovementType.REVERSAL, original.getOnHandChange().negate(), original.getUnitCost(), original.getRma(), usage, original, request.reason().trim());
            audit.record("PART_REVERT", "PART_MOVEMENT", movement.getId(), part.getCode(), "Movimento revertido. Motivo: " + request.reason().trim());
            return PartMovementResponse.from(movement, false);
        } catch (DataIntegrityViolationException exception) {
            // uk_part_movements_reversed guards concurrent reversals the snapshot read above could not see.
            throw new BusinessException("O movimento já foi revertido: " + movementId);
        }
    }

    @Transactional(readOnly = true)
    public RmaPartsResponse getRmaParts(Long rmaId) {
        RmaRecord rma = rmaService.getEntityById(rmaId);
        List<PartUsage> usages = partUsageRepository.findByRma_IdOrderByIdAsc(rmaId);
        List<PartMovement> ledger = partMovementRepository.findByRma_IdOrderByIdDesc(rmaId);
        Map<Long, BigDecimal> costs = new java.util.HashMap<>();
        ledger.stream().filter(m -> m.getType() == PartMovementType.CONSUMPTION && m.getUsage() != null)
            .forEach(m -> costs.putIfAbsent(m.getUsage().getId(), m.getUnitCost()));
        List<PartUsageResponse> usageResponses = usages.stream().map(usage -> {
            BigDecimal cost = costs.getOrDefault(usage.getId(), usage.getPart().getUnitCost());
            return PartUsageResponse.from(usage, cost, usage.getQuantity().multiply(cost).setScale(2, RoundingMode.HALF_UP));
        }).toList();
        Set<Long> reversedIds = new HashSet<>(partMovementRepository.findReversedMovementIdsByRmaId(rmaId));
        List<PartMovementResponse> movements = ledger.stream().map(movement -> PartMovementResponse.from(movement, reversedIds.contains(movement.getId()))).toList();

        List<PartUsageResponse> used = usageResponses.stream()
            .filter(usage -> usage.status() == PartUsageStatus.USED).toList();
        return new RmaPartsResponse(rma.getId(), rma.getCode(), usageResponses, movements,
            used.stream().map(PartUsageResponse::totalCost).reduce(BigDecimal.ZERO.setScale(2), BigDecimal::add), used);
    }

    public PartUsageResponse use(Long rmaId, PartUsageRequest request) {
        RmaRecord rma = lockOpenRma(rmaId, "Não é permitido usar peças em uma OS encerrada.");
        Part part = lockPart(request.partId());
        if (!part.isActive()) throw new BusinessException("A peça está inativa: " + part.getCode() + ".");
        QuantityRules.validate(request.quantity(), part.getUnit());
        if (trimToNull(request.replacementReason()) == null) throw new BusinessException("Informe o motivo da troca.");
        if (part.getOnHand().compareTo(request.quantity()) < 0) {
            throw new br.com.navitasassist.controller.ConflictException("Estoque insuficiente para a peça " + part.getCode() + ". Em estoque: " + format(part.getOnHand()) + ".");
        }
        PartUsage usage = new PartUsage();
        usage.setPart(part); usage.setRma(rma); usage.setQuantity(request.quantity());
        usage.setStatus(PartUsageStatus.USED);
        usage.setReplacementReason(request.replacementReason().trim());
        usage.setComponentBatch(trimToNull(request.componentBatch()));
        usage.setNote(trimToNull(request.notes()));
        usage.setAppliedAt(Instant.now()); usage.setAppliedBy(currentUsername());
        usage = partUsageRepository.save(usage);
        record(part, PartMovementType.CONSUMPTION, request.quantity().negate(),
            part.getUnitCost(), rma, usage, null, usage.getNote());
        br.com.navitasassist.rma.RmaRepairHistory.record(rma, "STOCK_COMPONENT", usage.getId(), "USE",
            br.com.navitasassist.rma.RepairHistorySummary.component("Peça usada", part.getName() + " (código: " + part.getCode() + ")",
                usage.getQuantity(), part.getUnit(), usage.getReplacementReason(), usage.getComponentBatch()), currentUsername());
        audit.record("PART_USE", "PART_USAGE", usage.getId(), part.getCode(), "Peça usada na OS " + rma.getCode() + ".");
        return toUsageResponse(usage);
    }

    public PartUsageResponse undoUse(Long rmaId, Long usageId, PartReversalRequest request) {
        findUsagePartId(rmaId, usageId);
        lockOpenRma(rmaId, "Não é permitido desfazer o uso de peças em uma OS encerrada.");
        PartMovement original = partMovementRepository.findFirstByUsage_IdAndTypeOrderByIdDesc(usageId, PartMovementType.CONSUMPTION)
            .orElseThrow(() -> new ResourceNotFoundException("Uso de peça não encontrado: " + usageId + "."));
        reverse(original.getId(), request);
        return toUsageResponse(lockUsage(usageId));
    }

    @Transactional(readOnly = true)
    public List<PartReplenishmentResponse> listReplenishment() {
        return partRepository.search(null).stream().filter(part -> part.isActive() && part.isBelowMinimum())
            .map(part -> new PartReplenishmentResponse(part.getId(), part.getCode(), part.getName(), part.getUnit(), part.getLocation(),
                part.getMinimumStock(), part.getOnHand(), part.getMinimumStock().subtract(part.getOnHand()).max(BigDecimal.ZERO), true)).toList();
    }

    private PartMovement record(Part part, PartMovementType type, BigDecimal onHandChange, BigDecimal unitCost, RmaRecord rma, PartUsage usage, PartMovement reversed, String reason) {
        BigDecimal onHand = part.getOnHand().add(onHandChange);
        if (onHand.signum() < 0) {
            throw new BusinessException("Estoque insuficiente para a peça " + part.getCode() + ". Em estoque: " + format(part.getOnHand()) + ".");
        }

        part.setOnHand(onHand);
        partRepository.save(part);

        BigDecimal quantity = onHandChange.abs();
        PartMovement movement = new PartMovement();
        movement.setPart(part);
        movement.setType(type);
        movement.setQuantity(quantity);
        movement.setOnHandChange(onHandChange);
        movement.setOnHandAfter(onHand);
        movement.setUnitCost(unitCost);
        movement.setTotalCost(quantity.multiply(unitCost).setScale(2, RoundingMode.HALF_UP));
        movement.setRma(rma);
        movement.setUsage(usage);
        movement.setReversedMovement(reversed);
        movement.setReason(reason);
        movement.setCreatedBy(currentUsername());
        movement.setCreatedAt(Instant.now());
        return partMovementRepository.save(movement);
    }

    private PartUsageResponse toUsageResponse(PartUsage usage) {
        BigDecimal unitCost = partMovementRepository.findFirstByUsage_IdAndTypeOrderByIdDesc(usage.getId(), PartMovementType.CONSUMPTION).map(PartMovement::getUnitCost).orElse(usage.getPart().getUnitCost());
        return PartUsageResponse.from(usage, unitCost, usage.getQuantity().multiply(unitCost).setScale(2, RoundingMode.HALF_UP));
    }

    /**
     * Locks the RMA row, serializing usage changes with status changes that close the RMA (see RmaService).
     */
    private RmaRecord lockOpenRma(Long rmaId, String closedMessage) {
        RmaRecord rma = rmaRecordRepository.findByIdForUpdate(rmaId).orElseThrow(() -> new ResourceNotFoundException("OS não encontrada: " + rmaId));
        if (CLOSED_RMA_STATUSES.contains(rma.getStatus())) {
            throw new BusinessException(closedMessage);
        }
        return rma;
    }

    private Part lockPart(Long partId) {
        return partRepository.findByIdForUpdate(partId).orElseThrow(() -> new ResourceNotFoundException("Peça não encontrada: " + partId));
    }

    private PartUsage lockUsage(Long usageId) {
        return partUsageRepository.findByIdForUpdate(usageId).orElseThrow(() -> new ResourceNotFoundException("Uso de peça não encontrado: " + usageId));
    }

    private Long findUsagePartId(Long rmaId, Long usageId) {
        return partUsageRepository.findPartIdByIdAndRmaId(usageId, rmaId).orElseThrow(() -> new ResourceNotFoundException("Uso de peça não encontrado: " + usageId));
    }

    private void ensurePartExists(Long partId) {
        if (!partRepository.existsById(partId)) {
            throw new ResourceNotFoundException("Peça não encontrada: " + partId);
        }
    }

    private BigDecimal requirePositive(BigDecimal quantity) {
        if (quantity.signum() <= 0) {
            throw new BusinessException("A quantidade deve ser maior que zero.");
        }
        return quantity;
    }

    private String format(BigDecimal value) {
        return value.stripTrailingZeros().toPlainString();
    }

    private String currentUsername() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            return "system";
        }
        return authentication.getName();
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }

        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
