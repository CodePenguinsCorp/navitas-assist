package br.com.navitasassist.service;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

import br.com.navitasassist.config.ShipmentProperties;
import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.controller.ResourceNotFoundException;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.repository.RmaShipmentEventRepository;
import br.com.navitasassist.repository.RmaShipmentRepository;
import br.com.navitasassist.shipment.CarrierEventIngestResponse;
import br.com.navitasassist.shipment.CarrierEventRequest;
import br.com.navitasassist.shipment.CarrierTrackingEvent;
import br.com.navitasassist.shipment.CarrierTrackingGateway;
import br.com.navitasassist.shipment.CreateShipmentRequest;
import br.com.navitasassist.shipment.ManualShipmentEventRequest;
import br.com.navitasassist.shipment.RmaShipment;
import br.com.navitasassist.shipment.RmaShipmentEvent;
import br.com.navitasassist.shipment.RmaShipmentSummaryResponse;
import br.com.navitasassist.shipment.ShipmentDetailResponse;
import br.com.navitasassist.shipment.ShipmentEventResponse;
import br.com.navitasassist.shipment.ShipmentEventSource;
import br.com.navitasassist.shipment.ShipmentResponse;
import br.com.navitasassist.shipment.ShipmentStatus;
import br.com.navitasassist.shipment.UpdateShipmentRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Internal logistics control for RMAs. Manual operation never depends on the carrier: integration events arrive through
 * {@link #ingest(CarrierEventRequest)} or {@link #sync(Long)} and are deduplicated by their external event id.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class ShipmentService {

    private static final List<String> ADDRESS_ROLES = List.of("ROLE_ADMIN", "ROLE_SERVICE_DESK");

    private final RmaShipmentRepository rmaShipmentRepository;
    private final RmaShipmentEventRepository rmaShipmentEventRepository;
    private final RmaRecordRepository rmaRecordRepository;
    private final CarrierTrackingGateway carrierTrackingGateway;
    private final ShipmentProperties shipmentProperties;

    @Transactional(readOnly = true)
    public List<ShipmentResponse> search(Long rmaId, ShipmentStatus status) {
        boolean canViewAddresses = canViewAddresses();
        return rmaShipmentRepository.search(rmaId, status).stream().map(shipment -> ShipmentResponse.from(shipment, canViewAddresses)).toList();
    }

    @Transactional(readOnly = true)
    public ShipmentDetailResponse getDetail(Long id) {
        return toDetail(getEntityById(id));
    }

    @Transactional(readOnly = true)
    public RmaShipmentSummaryResponse summarize(Long rmaId) {
        List<RmaShipment> shipments = rmaShipmentRepository.search(rmaId, null);
        BigDecimal totalCost = shipments.stream().map(RmaShipment::getCost).filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);
        int openExceptions = (int) shipments.stream().filter(shipment -> shipment.getStatus() == ShipmentStatus.EXCEPTION).count();
        return new RmaShipmentSummaryResponse(rmaId, shipments.size(), openExceptions, totalCost);
    }

    public ShipmentDetailResponse create(CreateShipmentRequest request) {
        RmaShipment shipment = new RmaShipment();
        shipment.setRma(rmaRecordRepository.findById(request.rmaId()).orElseThrow(() -> new ResourceNotFoundException("RMA not found: " + request.rmaId())));
        shipment.setType(request.type());
        applyFields(shipment, request.originName(), request.originAddress(), request.destinationName(), request.destinationAddress(),
            request.volumes(), request.carrier(), request.serviceName(), request.trackingCode(), request.labelReference(), request.cost());
        validateTrackingCode(shipment, null);

        ShipmentStatus initialStatus = shipment.getTrackingCode() == null ? ShipmentStatus.CREATED : ShipmentStatus.LABEL_ISSUED;
        shipment.setStatus(initialStatus);
        RmaShipment saved = saveUnique(shipment);
        recordEvent(saved, newEvent(ShipmentEventSource.SYSTEM, initialStatus, "Shipment created", null, null, Instant.now()));
        return toDetail(saved);
    }

    public ShipmentDetailResponse update(Long id, UpdateShipmentRequest request) {
        RmaShipment shipment = rmaShipmentRepository.findByIdForUpdate(id).orElseThrow(() -> new ResourceNotFoundException("Shipment not found: " + id));
        List<String> changes = new ArrayList<>();
        String previousTracking = shipment.getTrackingCode();
        String previousCarrier = shipment.getCarrier();
        BigDecimal previousCost = shipment.getCost();
        if (shipment.getType() != request.type()) {
            changes.add("type");
        }

        shipment.setType(request.type());
        applyFields(shipment, request.originName(), request.originAddress(), request.destinationName(), request.destinationAddress(),
            request.volumes(), request.carrier(), request.serviceName(), request.trackingCode(), request.labelReference(), request.cost());
        validateTrackingCode(shipment, id);
        if (shipment.getAddressesPurgedAt() != null) {
            shipment.setOriginAddress(null);
            shipment.setDestinationAddress(null);
        }

        if (!Objects.equals(previousCarrier, shipment.getCarrier()) || !Objects.equals(previousTracking, shipment.getTrackingCode())) {
            changes.add("tracking");
        }
        if (previousCost == null ? shipment.getCost() != null : shipment.getCost() == null || previousCost.compareTo(shipment.getCost()) != 0) {
            changes.add("cost");
        }

        ShipmentStatus status = shipment.getStatus();
        if (status == ShipmentStatus.CREATED && shipment.getTrackingCode() != null) {
            status = ShipmentStatus.LABEL_ISSUED;
            shipment.setStatus(status);
        }
        String description = changes.isEmpty() ? "Shipment data updated" : "Shipment data updated: " + String.join(", ", changes);
        RmaShipment saved = saveUnique(shipment);
        recordEvent(saved, newEvent(ShipmentEventSource.MANUAL, status, description, null, request.justification(), Instant.now()));
        return toDetail(saved);
    }

    public ShipmentDetailResponse addManualEvent(Long id, ManualShipmentEventRequest request) {
        RmaShipment shipment = rmaShipmentRepository.findByIdForUpdate(id).orElseThrow(() -> new ResourceNotFoundException("Shipment not found: " + id));
        Instant occurredAt = request.occurredAt() == null ? Instant.now() : request.occurredAt();
        if (occurredAt.isAfter(Instant.now().plus(Duration.ofMinutes(5)))) {
            throw new BusinessException("Event date cannot be in the future.");
        }

        RmaShipmentEvent event = newEvent(ShipmentEventSource.MANUAL, request.status(), request.description(), request.proofReference(), request.justification(), occurredAt);
        applyEvent(shipment, event);
        return toDetail(rmaShipmentRepository.save(shipment));
    }

    public CarrierEventIngestResponse ingest(CarrierEventRequest request) {
        RmaShipment shipment = rmaShipmentRepository.findByCarrierKeyAndTrackingCodeForUpdate(normalizeCarrierKey(request.carrier()), normalizeTracking(request.trackingCode()))
            .orElseThrow(() -> new ResourceNotFoundException("Shipment not found for tracking code: " + request.trackingCode()));
        boolean duplicate = !ingestEvent(shipment, new CarrierTrackingEvent(request.externalEventId(), request.status(), request.description(), request.proofReference(), request.occurredAt()));
        rmaShipmentRepository.save(shipment);
        return new CarrierEventIngestResponse(shipment.getId(), shipment.getStatus(), duplicate);
    }

    public ShipmentDetailResponse sync(Long id) {
        RmaShipment shipment = rmaShipmentRepository.findByIdForUpdate(id).orElseThrow(() -> new ResourceNotFoundException("Shipment not found: " + id));
        if (shipment.getTrackingCode() == null) {
            throw new BusinessException("Register a tracking code before syncing with the carrier.");
        }

        carrierTrackingGateway.fetchEvents(shipment.getCarrier(), shipment.getTrackingCode()).forEach(event -> ingestEvent(shipment, event));
        return toDetail(rmaShipmentRepository.save(shipment));
    }

    public int purgeExpiredAddresses(Instant now) {
        Instant closedBefore = now.minus(Duration.ofDays(shipmentProperties.getAddressRetentionDays()));
        List<RmaShipment> expired = rmaShipmentRepository.findClosedWithAddressesBefore(closedBefore);
        expired.forEach(shipment -> {
            shipment.setOriginAddress(null);
            shipment.setDestinationAddress(null);
            shipment.setAddressesPurgedAt(now);
        });
        rmaShipmentRepository.saveAll(expired);
        return expired.size();
    }

    @Transactional(readOnly = true)
    public RmaShipment getEntityById(Long id) {
        return rmaShipmentRepository.findById(id).orElseThrow(() -> new ResourceNotFoundException("Shipment not found: " + id));
    }

    private boolean ingestEvent(RmaShipment shipment, CarrierTrackingEvent trackingEvent) {
        String externalEventId = trimToNull(trackingEvent.externalEventId());
        if (externalEventId == null || trackingEvent.status() == null || trackingEvent.occurredAt() == null) {
            throw new BusinessException("Carrier events require an id, a status and an occurrence date.");
        }
        boolean alreadyProcessed = shipment.getEvents().stream().anyMatch(event -> externalEventId.equals(event.getExternalEventId()));
        if (alreadyProcessed) {
            return false;
        }

        RmaShipmentEvent event = newEvent(ShipmentEventSource.INTEGRATION, trackingEvent.status(), trackingEvent.description(), trackingEvent.proofReference(), null, trackingEvent.occurredAt());
        event.setExternalEventId(externalEventId);
        applyEvent(shipment, event);
        return true;
    }

    private void applyEvent(RmaShipment shipment, RmaShipmentEvent event) {
        recordEvent(shipment, event);
        if (shipment.getStatusChangedAt() != null && shipment.getStatusChangedAt().isAfter(event.getOccurredAt())) {
            return;
        }

        shipment.setStatus(event.getStatus());
        shipment.setStatusChangedAt(event.getOccurredAt());
        shipment.setClosedAt(event.getStatus().isClosed() ? event.getOccurredAt() : null);
    }

    private void recordEvent(RmaShipment shipment, RmaShipmentEvent event) {
        shipment.addEvent(event);
        rmaShipmentEventRepository.save(event);
    }

    private RmaShipmentEvent newEvent(ShipmentEventSource source, ShipmentStatus status, String description, String proofReference, String justification, Instant occurredAt) {
        RmaShipmentEvent event = new RmaShipmentEvent();
        event.setSource(source);
        event.setStatus(status);
        event.setDescription(trimToNull(description));
        event.setProofReference(trimToNull(proofReference));
        event.setJustification(trimToNull(justification));
        event.setOccurredAt(occurredAt);
        event.setRecordedBy(currentUsername());
        event.setRecordedAt(Instant.now());
        return event;
    }

    private void applyFields(RmaShipment shipment, String originName, String originAddress, String destinationName, String destinationAddress,
        Integer volumes, String carrier, String serviceName, String trackingCode, String labelReference, BigDecimal cost) {
        shipment.setOriginName(originName.trim());
        shipment.setOriginAddress(trimToNull(originAddress));
        shipment.setDestinationName(destinationName.trim());
        shipment.setDestinationAddress(trimToNull(destinationAddress));
        shipment.setVolumes(volumes);
        shipment.setCarrier(carrier.trim());
        shipment.setCarrierKey(normalizeCarrierKey(carrier));
        shipment.setServiceName(trimToNull(serviceName));
        shipment.setTrackingCode(normalizeTracking(trackingCode));
        shipment.setLabelReference(trimToNull(labelReference));
        shipment.setCost(cost);
    }

    private void validateTrackingCode(RmaShipment shipment, Long excludedId) {
        if (shipment.getTrackingCode() != null && rmaShipmentRepository.existsTrackingCode(shipment.getCarrierKey(), shipment.getTrackingCode(), excludedId)) {
            throw new BusinessException("Tracking code already registered for this carrier: " + shipment.getTrackingCode());
        }
    }

    private ShipmentDetailResponse toDetail(RmaShipment shipment) {
        return new ShipmentDetailResponse(
            ShipmentResponse.from(shipment, canViewAddresses()),
            shipment.getEvents().stream()
                .sorted(Comparator.comparing(RmaShipmentEvent::getOccurredAt).thenComparing(RmaShipmentEvent::getId).reversed())
                .map(ShipmentEventResponse::from)
                .toList()
        );
    }

    private boolean canViewAddresses() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null && authentication.getAuthorities().stream().map(GrantedAuthority::getAuthority).anyMatch(ADDRESS_ROLES::contains);
    }

    private String currentUsername() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            return "system";
        }
        return authentication.getName();
    }

    private RmaShipment saveUnique(RmaShipment shipment) {
        try {
            return rmaShipmentRepository.saveAndFlush(shipment);
        } catch (DataIntegrityViolationException exception) {
            throw new BusinessException("Tracking code already registered for this carrier: " + shipment.getTrackingCode());
        }
    }

    private String normalizeCarrierKey(String carrier) {
        return carrier.trim().replaceAll("\\s+", " ").toUpperCase(Locale.ROOT);
    }

    private String normalizeTracking(String value) {
        String trimmed = trimToNull(value);
        return trimmed == null ? null : trimmed.toUpperCase(Locale.ROOT);
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }

        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
