package br.com.navitasassist.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.controller.ResourceNotFoundException;
import br.com.navitasassist.part.Part;
import br.com.navitasassist.part.PartMovement;
import br.com.navitasassist.part.PartMovementRequest;
import br.com.navitasassist.part.PartMovementResponse;
import br.com.navitasassist.part.PartMovementType;
import br.com.navitasassist.part.PartReplenishmentResponse;
import br.com.navitasassist.part.PartReservation;
import br.com.navitasassist.part.PartReservationRequest;
import br.com.navitasassist.part.PartReservationResponse;
import br.com.navitasassist.part.PartReservationStatus;
import br.com.navitasassist.part.PartReversalRequest;
import br.com.navitasassist.part.RmaPartsResponse;
import br.com.navitasassist.repository.PartMovementRepository;
import br.com.navitasassist.repository.PartRepository;
import br.com.navitasassist.repository.PartReservationRepository;
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
 * together with an immutable {@link PartMovement}. Lock order is RMA, then part, then reservation.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class PartStockService {

    private static final Set<PartMovementType> MANUAL_TYPES = EnumSet.of(PartMovementType.ENTRY, PartMovementType.EXIT, PartMovementType.ADJUSTMENT);
    private static final Set<RmaStatus> CLOSED_RMA_STATUSES = EnumSet.of(RmaStatus.COMPLETED, RmaStatus.RETURNED, RmaStatus.IRREPARABLE);
    private static final String CLOSED_RMA_RESERVATION_MESSAGE = "Parts cannot be allocated or consumed for a closed RMA.";

    private final PartRepository partRepository;
    private final PartMovementRepository partMovementRepository;
    private final PartReservationRepository partReservationRepository;
    private final RmaRecordRepository rmaRecordRepository;
    private final RmaService rmaService;

    @Transactional(readOnly = true)
    public List<PartMovementResponse> listMovements(Long partId) {
        ensurePartExists(partId);
        Set<Long> reversedIds = new HashSet<>(partMovementRepository.findReversedMovementIdsByPartId(partId));
        return partMovementRepository.findByPart_IdOrderByIdDesc(partId).stream().map(movement -> PartMovementResponse.from(movement, reversedIds.contains(movement.getId()))).toList();
    }

    public PartMovementResponse registerMovement(Long partId, PartMovementRequest request) {
        if (!MANUAL_TYPES.contains(request.type())) {
            throw new BusinessException("Only ENTRY, EXIT and ADJUSTMENT movements can be registered manually.");
        }

        BigDecimal quantity = request.quantity();
        String reason = trimToNull(request.reason());
        BigDecimal onHandChange = switch (request.type()) {
            case ENTRY -> requirePositive(quantity);
            case EXIT -> requirePositive(quantity).negate();
            default -> {
                if (quantity.signum() == 0) {
                    throw new BusinessException("Adjustment quantity must not be zero.");
                }
                if (reason == null) {
                    throw new BusinessException("A reason is required for stock adjustments.");
                }
                yield quantity;
            }
        };

        Part part = lockPart(partId);
        PartMovement movement = record(part, request.type(), onHandChange, BigDecimal.ZERO, part.getUnitCost(), null, null, null, reason);
        return PartMovementResponse.from(movement, false);
    }

    public PartMovementResponse reverse(Long movementId, PartReversalRequest request) {
        Long partId = partMovementRepository.findById(movementId).map(movement -> movement.getPart().getId()).orElseThrow(() -> new ResourceNotFoundException("Movement not found: " + movementId));
        Part part = lockPart(partId);
        PartMovement original = partMovementRepository.findById(movementId).orElseThrow();

        if (original.getType() == PartMovementType.RESERVATION || original.getType() == PartMovementType.RESERVATION_CANCEL) {
            throw new BusinessException("Reservation movements are corrected by cancelling the reservation.");
        }
        if (original.getType() == PartMovementType.REVERSAL) {
            throw new BusinessException("Reversal movements cannot be reversed.");
        }
        if (partMovementRepository.existsByReversedMovement_Id(movementId)) {
            throw new BusinessException("Movement has already been reversed: " + movementId);
        }

        // A reversed consumption returns the quantity to free stock; the reservation is closed as REVERSED.
        PartReservation reservation = original.getReservation();
        if (original.getType() == PartMovementType.CONSUMPTION && reservation != null) {
            reservation = lockReservation(reservation.getId());
            reservation.setStatus(PartReservationStatus.REVERSED);
        }

        try {
            PartMovement movement = record(part, PartMovementType.REVERSAL, original.getOnHandChange().negate(), BigDecimal.ZERO, original.getUnitCost(), original.getRma(), reservation, original, request.reason().trim());
            return PartMovementResponse.from(movement, false);
        } catch (DataIntegrityViolationException exception) {
            // uk_part_movements_reversed guards concurrent reversals the snapshot read above could not see.
            throw new BusinessException("Movement has already been reversed: " + movementId);
        }
    }

    @Transactional(readOnly = true)
    public RmaPartsResponse getRmaParts(Long rmaId) {
        RmaRecord rma = rmaService.getEntityById(rmaId);
        List<PartReservation> reservations = partReservationRepository.findByRma_IdOrderByIdAsc(rmaId);
        List<PartReservationResponse> reservationResponses = reservations.stream().map(this::toReservationResponse).toList();
        Set<Long> reversedIds = new HashSet<>(partMovementRepository.findReversedMovementIdsByRmaId(rmaId));
        List<PartMovementResponse> movements = partMovementRepository.findByRma_IdOrderByIdDesc(rmaId).stream().map(movement -> PartMovementResponse.from(movement, reversedIds.contains(movement.getId()))).toList();

        return new RmaPartsResponse(
            rma.getId(),
            rma.getCode(),
            reservationResponses,
            movements,
            sumCost(reservationResponses, PartReservationStatus.ACTIVE),
            sumCost(reservationResponses, PartReservationStatus.CONSUMED),
            reservationResponses.stream().filter(reservation -> reservation.status() == PartReservationStatus.PENDING).count()
        );
    }

    /**
     * Reserves stock for an RMA without consuming it. When the available balance cannot cover the quantity the request
     * is kept as PENDING, which feeds the pending-parts list and the replenishment alert.
     */
    public PartReservationResponse reserve(Long rmaId, PartReservationRequest request) {
        RmaRecord rma = lockOpenRma(rmaId, "Parts cannot be reserved for a closed RMA.");

        Part part = lockPart(request.partId());
        if (!part.isActive()) {
            throw new BusinessException("Part is inactive: " + part.getCode());
        }

        PartReservation reservation = new PartReservation();
        reservation.setPart(part);
        reservation.setRma(rma);
        reservation.setQuantity(request.quantity());
        reservation.setNote(trimToNull(request.note()));
        boolean available = part.getAvailable().compareTo(request.quantity()) >= 0;
        reservation.setStatus(available ? PartReservationStatus.ACTIVE : PartReservationStatus.PENDING);
        reservation = partReservationRepository.save(reservation);

        if (available) {
            record(part, PartMovementType.RESERVATION, BigDecimal.ZERO, request.quantity(), part.getUnitCost(), rma, reservation, null, reservation.getNote());
        }
        return toReservationResponse(reservation);
    }

    public PartReservationResponse allocate(Long rmaId, Long reservationId) {
        Long partId = findReservationPartId(rmaId, reservationId);
        lockOpenRma(rmaId, CLOSED_RMA_RESERVATION_MESSAGE);
        Part part = lockPart(partId);
        PartReservation reservation = lockReservation(reservationId);
        requireStatus(reservation, "Only pending reservations can be allocated.", PartReservationStatus.PENDING);
        if (!part.isActive()) {
            throw new BusinessException("Part is inactive: " + part.getCode());
        }

        record(part, PartMovementType.RESERVATION, BigDecimal.ZERO, reservation.getQuantity(), part.getUnitCost(), reservation.getRma(), reservation, null, null);
        reservation.setStatus(PartReservationStatus.ACTIVE);
        return toReservationResponse(partReservationRepository.save(reservation));
    }

    public PartReservationResponse consume(Long rmaId, Long reservationId) {
        Long partId = findReservationPartId(rmaId, reservationId);
        lockOpenRma(rmaId, CLOSED_RMA_RESERVATION_MESSAGE);
        Part part = lockPart(partId);
        PartReservation reservation = lockReservation(reservationId);
        requireStatus(reservation, "Only active reservations can be consumed.", PartReservationStatus.ACTIVE);

        record(part, PartMovementType.CONSUMPTION, reservation.getQuantity().negate(), reservation.getQuantity().negate(), part.getUnitCost(), reservation.getRma(), reservation, null, null);
        reservation.setStatus(PartReservationStatus.CONSUMED);
        return toReservationResponse(partReservationRepository.save(reservation));
    }

    public PartReservationResponse cancel(Long rmaId, Long reservationId) {
        Part part = lockPart(findReservationPartId(rmaId, reservationId));
        PartReservation reservation = lockReservation(reservationId);
        requireStatus(reservation, "Only active or pending reservations can be cancelled.", PartReservationStatus.ACTIVE, PartReservationStatus.PENDING);

        if (reservation.getStatus() == PartReservationStatus.ACTIVE) {
            record(part, PartMovementType.RESERVATION_CANCEL, BigDecimal.ZERO, reservation.getQuantity().negate(), part.getUnitCost(), reservation.getRma(), reservation, null, null);
        }
        reservation.setStatus(PartReservationStatus.CANCELLED);
        return toReservationResponse(partReservationRepository.save(reservation));
    }

    @Transactional(readOnly = true)
    public List<PartReservationResponse> listPending() {
        return partReservationRepository.findByStatusOrderByIdAsc(PartReservationStatus.PENDING).stream().map(this::toReservationResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<PartReplenishmentResponse> listReplenishment() {
        Map<Long, BigDecimal> pendingByPart = partReservationRepository.findByStatusOrderByIdAsc(PartReservationStatus.PENDING).stream()
            .collect(Collectors.groupingBy(reservation -> reservation.getPart().getId(), Collectors.reducing(BigDecimal.ZERO, PartReservation::getQuantity, BigDecimal::add)));

        return partRepository.search(null).stream()
            .filter(part -> part.isActive() && (part.isBelowMinimum() || pendingByPart.containsKey(part.getId())))
            .map(part -> {
                BigDecimal pending = pendingByPart.getOrDefault(part.getId(), BigDecimal.ZERO);
                BigDecimal suggested = part.getMinimumStock().add(pending).subtract(part.getAvailable()).max(BigDecimal.ZERO);
                return new PartReplenishmentResponse(part.getId(), part.getCode(), part.getName(), part.getUnit(), part.getLocation(), part.getMinimumStock(), part.getOnHand(), part.getReserved(), part.getAvailable(), pending, suggested, part.isBelowMinimum());
            })
            .toList();
    }

    private PartMovement record(Part part, PartMovementType type, BigDecimal onHandChange, BigDecimal reservedChange, BigDecimal unitCost, RmaRecord rma, PartReservation reservation, PartMovement reversed, String reason) {
        BigDecimal onHand = part.getOnHand().add(onHandChange);
        BigDecimal reservedQuantity = part.getReserved().add(reservedChange);
        if (reservedQuantity.signum() < 0 || onHand.compareTo(reservedQuantity) < 0) {
            throw new BusinessException("Insufficient available stock for part " + part.getCode() + ". Available: " + format(part.getAvailable()));
        }

        part.setOnHand(onHand);
        part.setReserved(reservedQuantity);
        partRepository.save(part);

        BigDecimal quantity = onHandChange.signum() != 0 ? onHandChange.abs() : reservedChange.abs();
        PartMovement movement = new PartMovement();
        movement.setPart(part);
        movement.setType(type);
        movement.setQuantity(quantity);
        movement.setOnHandChange(onHandChange);
        movement.setReservedChange(reservedChange);
        movement.setOnHandAfter(onHand);
        movement.setReservedAfter(reservedQuantity);
        movement.setUnitCost(unitCost);
        movement.setTotalCost(quantity.multiply(unitCost).setScale(2, RoundingMode.HALF_UP));
        movement.setRma(rma);
        movement.setReservation(reservation);
        movement.setReversedMovement(reversed);
        movement.setReason(reason);
        movement.setCreatedBy(currentUsername());
        movement.setCreatedAt(Instant.now());
        return partMovementRepository.save(movement);
    }

    private PartReservationResponse toReservationResponse(PartReservation reservation) {
        BigDecimal unitCost = reservation.getStatus() == PartReservationStatus.CONSUMED
            ? partMovementRepository.findFirstByReservation_IdAndTypeOrderByIdDesc(reservation.getId(), PartMovementType.CONSUMPTION).map(PartMovement::getUnitCost).orElse(reservation.getPart().getUnitCost())
            : reservation.getPart().getUnitCost();
        return PartReservationResponse.from(reservation, unitCost, reservation.getQuantity().multiply(unitCost).setScale(2, RoundingMode.HALF_UP));
    }

    private BigDecimal sumCost(List<PartReservationResponse> reservations, PartReservationStatus status) {
        return reservations.stream().filter(reservation -> reservation.status() == status).map(PartReservationResponse::totalCost).reduce(BigDecimal.ZERO.setScale(2), BigDecimal::add);
    }

    /**
     * Locks the RMA row, serializing reservation changes with status changes that close the RMA (see RmaService).
     */
    private RmaRecord lockOpenRma(Long rmaId, String closedMessage) {
        RmaRecord rma = rmaRecordRepository.findByIdForUpdate(rmaId).orElseThrow(() -> new ResourceNotFoundException("RMA not found: " + rmaId));
        if (CLOSED_RMA_STATUSES.contains(rma.getStatus())) {
            throw new BusinessException(closedMessage);
        }
        return rma;
    }

    private Part lockPart(Long partId) {
        return partRepository.findByIdForUpdate(partId).orElseThrow(() -> new ResourceNotFoundException("Part not found: " + partId));
    }

    private PartReservation lockReservation(Long reservationId) {
        return partReservationRepository.findByIdForUpdate(reservationId).orElseThrow(() -> new ResourceNotFoundException("Reservation not found: " + reservationId));
    }

    private Long findReservationPartId(Long rmaId, Long reservationId) {
        return partReservationRepository.findPartIdByIdAndRmaId(reservationId, rmaId).orElseThrow(() -> new ResourceNotFoundException("Reservation not found: " + reservationId));
    }

    private void ensurePartExists(Long partId) {
        if (!partRepository.existsById(partId)) {
            throw new ResourceNotFoundException("Part not found: " + partId);
        }
    }

    private void requireStatus(PartReservation reservation, String message, PartReservationStatus... allowed) {
        if (!EnumSet.of(allowed[0], allowed).contains(reservation.getStatus())) {
            throw new BusinessException(message);
        }
    }

    private BigDecimal requirePositive(BigDecimal quantity) {
        if (quantity.signum() <= 0) {
            throw new BusinessException("Quantity must be greater than zero.");
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
