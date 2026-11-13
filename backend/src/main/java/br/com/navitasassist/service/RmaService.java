package br.com.navitasassist.service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.EnumSet;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.controller.ResourceNotFoundException;
import br.com.navitasassist.diagnosis.Diagnosis;
import br.com.navitasassist.diagnosis.DiagnosisRequest;
import br.com.navitasassist.item.ItemIdentification;
import br.com.navitasassist.notification.NotificationEventType;
import br.com.navitasassist.notification.RmaNotificationEvent;
import br.com.navitasassist.pagination.PageParams;
import br.com.navitasassist.pagination.PageResponse;
import br.com.navitasassist.part.PartReservationStatus;
import br.com.navitasassist.repository.PartReservationRepository;
import br.com.navitasassist.repository.RmaCodeGenerationLockRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.rma.CreateRmaRequest;
import br.com.navitasassist.rma.RmaAssigneeUpdateRequest;
import br.com.navitasassist.rma.RmaBlock;
import br.com.navitasassist.rma.RmaBlockRequest;
import br.com.navitasassist.rma.RmaBlockResolveRequest;
import br.com.navitasassist.rma.RmaAssignmentHistory;
import br.com.navitasassist.rma.RmaDueDateHistory;
import br.com.navitasassist.rma.RmaItem;
import br.com.navitasassist.rma.RmaItemWarrantyRequest;
import br.com.navitasassist.rma.RmaItemWarrantyHistory;
import br.com.navitasassist.rma.WarrantyStatus;
import br.com.navitasassist.rma.RmaItemRequest;
import br.com.navitasassist.rma.RmaPriority;
import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.rma.RmaResponse;
import br.com.navitasassist.rma.RmaStatus;
import br.com.navitasassist.rma.RmaStatusHistory;
import br.com.navitasassist.rma.RmaStatusUpdateRequest;
import br.com.navitasassist.rma.RmaSummaryResponse;
import br.com.navitasassist.rma.UpdateRmaRequest;
import br.com.navitasassist.user.UserAccount;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class RmaService {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Sao_Paulo");
    private static final Set<RmaStatus> CLOSED_STATUSES = EnumSet.of(RmaStatus.COMPLETED, RmaStatus.RETURNED, RmaStatus.IRREPARABLE);
    private static final Set<PartReservationStatus> OPEN_RESERVATION_STATUSES = EnumSet.of(PartReservationStatus.ACTIVE, PartReservationStatus.PENDING);
    private static final int MAX_YEARLY_SEQUENCE = 999_999;

    private final RmaRecordRepository rmaRecordRepository;
    private final RmaCodeGenerationLockRepository rmaCodeGenerationLockRepository;
    private final RmaStageTimeService rmaStageTimeService;
    private final RmaDeadlineService rmaDeadlineService;
    private final ClientService clientService;
    private final ProductService productService;
    private final UserAccountService userAccountService;
    private final ProtocolExecutionService protocolExecutionService;
    private final ApplicationEventPublisher eventPublisher;
    private final PartReservationRepository partReservationRepository;

    @Transactional(readOnly = true)
    public List<RmaResponse> search(String query, RmaStatus status) {
        List<RmaRecord> records = rmaRecordRepository.search(trimToNull(query), status);
        loadWarrantyHistory(records);
        return records.stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public PageResponse<RmaResponse> searchPage(String query, RmaStatus status, Integer page, Integer size) {
        var records = rmaRecordRepository.searchPage(trimToNull(query), status, PageParams.of(page, size));
        loadWarrantyHistory(records.getContent());
        return PageResponse.from(records, this::toResponse);
    }

    @Transactional(readOnly = true)
    public RmaSummaryResponse summarize(String query, RmaStatus status) {
        return rmaRecordRepository.summarize(trimToNull(query), status, List.of(RmaStatus.COMPLETED, RmaStatus.RETURNED, RmaStatus.IRREPARABLE));
    }

    @Transactional(readOnly = true)
    public RmaResponse getById(Long id) {
        return toResponse(getEntityById(id));
    }

    @Transactional(readOnly = true)
    public RmaResponse getByCode(String code) {
        return toResponse(rmaRecordRepository.findByCodeIgnoreCase(code)
            .orElseThrow(() -> new ResourceNotFoundException("RMA not found: " + code)));
    }

    @Transactional(readOnly = true)
    public List<RmaResponse> findHistory(String batchNumber, String serialNumber) {
        String normalizedBatch = trimToNull(batchNumber);
        String normalizedSerial = trimToNull(serialNumber);

        if (normalizedBatch == null && normalizedSerial == null) {
            throw new BusinessException("Provide a batch number or a serial number to load history.");
        }

        List<RmaRecord> records = rmaRecordRepository.findHistory(normalizedBatch, normalizedSerial);
        loadWarrantyHistory(records);
        return records.stream().map(this::toResponse).toList();
    }

    private void loadWarrantyHistory(List<RmaRecord> records) {
        if (!records.isEmpty()) {
            rmaRecordRepository.fetchItemsWithProducts(records);
            rmaRecordRepository.fetchItemWarrantyHistory(records);
        }
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public RmaResponse create(CreateRmaRequest request) {
        Client client = clientService.getEntityById(request.clientId());
        List<RmaItem> items = buildItems(request.items());

        RmaRecord rma = new RmaRecord();
        rma.setClient(client);
        rma.setStatus(RmaStatus.RECEIVED);
        rma.setPriority(defaultPriority(request.priority()));
        rma.setReceivedBy(currentUsername());

        rma.replaceItems(items);
        syncLegacyItem(rma);
        applyCommonFields(
            rma,
            request.purchaseDate(),
            request.purchaseDateUnknown(),
            request.entryDate(),
            request.invoiceNumber(),
            request.reportedFailure(),
            request.receivedAccessories(),
            request.physicalCondition(),
            request.repairSummary(),
            request.replacedPartsSummary(),
            request.testSummary(),
            null,
            null,
            null
        );
        rma.setDueDate(request.dueDate());
        validateMandatoryFields(rma);
        validateDates(rma);
        if (rma.getDueDate() != null) {
            addDueDateHistory(rma, null, rma.getDueDate());
        }
        rma.setCode(generateNextCode());
        addStatusHistory(rma, RmaStatus.RECEIVED, "RMA created");

        RmaRecord saved = rmaRecordRepository.save(rma);
        eventPublisher.publishEvent(new RmaNotificationEvent(NotificationEventType.RMA_CREATED, "RMA_CREATED:" + saved.getId(), saved.getId(), Instant.now(), currentUsername()));
        return toResponse(saved);
    }

    public RmaResponse update(Long id, UpdateRmaRequest request) {
        if (Boolean.TRUE.equals(request.clearDueDate()) && request.dueDate() != null) {
            throw new BusinessException("Provide a due date or clear it, not both.");
        }
        RmaRecord rma = getEntityForUpdate(id);

        if (request.clientId() != null) {
            rma.setClient(clientService.getEntityById(request.clientId()));
        }
        if (request.items() != null) {
            replaceItemsPreservingWarranty(rma, request.items());
            syncLegacyItem(rma);
        }
        if (request.priority() != null && request.priority() != rma.getPriority()) {
            addStatusHistory(rma, rma.getStatus(), "Priority changed from " + rma.getPriority() + " to " + request.priority());
            rma.setPriority(request.priority());
        }

        applyCommonFields(
            rma,
            request.purchaseDate(),
            request.purchaseDateUnknown(),
            request.entryDate(),
            request.invoiceNumber(),
            request.reportedFailure(),
            request.receivedAccessories(),
            request.physicalCondition(),
            request.repairSummary(),
            request.replacedPartsSummary(),
            request.testSummary(),
            request.shippedAt(),
            request.carrier(),
            request.trackingCode()
        );

        LocalDate previousDueDate = rma.getDueDate();
        LocalDate nextDueDate = Boolean.TRUE.equals(request.clearDueDate()) ? null
            : request.dueDate() != null ? request.dueDate() : previousDueDate;
        rma.setDueDate(nextDueDate);

        validateMandatoryFields(rma);
        validateDates(rma);
        if (!Objects.equals(previousDueDate, nextDueDate)) {
            addDueDateHistory(rma, previousDueDate, nextDueDate);
        }

        return toResponse(rmaRecordRepository.save(rma));
    }

    public RmaResponse updateStatusNote(Long id, Long eventId, br.com.navitasassist.rma.RmaStatusNoteRequest request) {
        RmaRecord rma = getEntityForUpdate(id);
        RmaStatusHistory event = rma.getStatusHistory().stream().filter(item -> item.getId().equals(eventId)).findFirst()
            .orElseThrow(() -> new ResourceNotFoundException("Evento de status não encontrado neste RMA."));
        if (CLOSED_STATUSES.contains(rma.getStatus())) throw new BusinessException("Não é permitido editar observações de um RMA encerrado.");
        String note = trimToNull(request.note());
        if (note != null && note.length() > 255) throw new BusinessException("Use até 255 caracteres na observação.");
        event.setNote(note);
        event.setNoteEditedBy(currentUsername());
        event.setNoteEditedAt(Instant.now());
        return toResponse(rmaRecordRepository.saveAndFlush(rma));
    }

    public RmaResponse updateStatus(Long id, RmaStatusUpdateRequest request) {
        return applyStatusChange(getEntityForUpdate(id), request);
    }

    public RmaResponse updateWarranty(Long id, Long itemId, RmaItemWarrantyRequest request) {
        RmaRecord rma = getEntityForUpdate(id);
        RmaItem item = rma.getItems().stream().filter(candidate -> candidate.getId().equals(itemId)).findFirst()
            .orElseThrow(() -> new ResourceNotFoundException("Item não encontrado neste RMA: " + itemId));
        if (CLOSED_STATUSES.contains(rma.getStatus())) {
            throw new BusinessException("Não é possível ajustar a garantia de um RMA encerrado.");
        }
        WarrantyStatus next = null;
        if (request.override() != null) {
            if (!request.override().equals("IN_WARRANTY") && !request.override().equals("OUT_OF_WARRANTY")) {
                throw new BusinessException("Garantia manual deve ser IN_WARRANTY ou OUT_OF_WARRANTY.");
            }
            next = WarrantyStatus.valueOf(request.override());
        }
        String reason = trimToNull(request.reason());
        if ((next != null && reason == null) || (reason != null && reason.length() > 255)) {
            throw new BusinessException("Informe um motivo de até 255 caracteres para ajustar a garantia.");
        }
        if (next == null && item.getWarrantyOverride() == null) return toResponse(rma);

        Instant now = Instant.now();
        RmaItemWarrantyHistory history = new RmaItemWarrantyHistory();
        history.setPreviousOverride(item.getWarrantyOverride());
        history.setNewOverride(next);
        history.setReason(reason);
        history.setChangedBy(currentUsername());
        history.setChangedAt(now);
        item.addWarrantyHistory(history);
        item.setWarrantyOverride(next);
        item.setWarrantyOverrideReason(next == null ? null : reason);
        item.setWarrantyOverrideBy(next == null ? null : history.getChangedBy());
        item.setWarrantyOverrideAt(next == null ? null : now);
        rma.setUpdatedAt(now);
        return toResponse(rmaRecordRepository.save(rma));
    }

    private RmaResponse applyStatusChange(RmaRecord rma, RmaStatusUpdateRequest request) {
        boolean changed = !Objects.equals(rma.getStatus(), request.status());

        // Closing requires every part reservation to be consumed or cancelled first, so no stock stays locked or pending
        // on a closed RMA. The RMA row is locked here and by PartStockService, which serializes both sides.
        if (changed && CLOSED_STATUSES.contains(request.status())
            && partReservationRepository.existsByRma_IdAndStatusIn(rma.getId(), OPEN_RESERVATION_STATUSES)) {
            throw new BusinessException("RMA has open part reservations. Consume or cancel them before closing.");
        }

        if (changed) {
            protocolExecutionService.assertTransitionAllowed(rma, request.status());
            rma.setStatus(request.status());
        }
        if (changed || trimToNull(request.note()) != null) {
            addStatusHistory(rma, request.status(), request.note());
        }

        return toResponse(rmaRecordRepository.save(rma));
    }

    public RmaResponse updateAssignee(Long id, RmaAssigneeUpdateRequest request) {
        RmaRecord rma = getEntityForUpdate(id);
        UserAccount previousAssignee = rma.getAssignee();
        UserAccount newAssignee = request.assigneeId() == null
            ? null
            : userAccountService.getAssignableTechnicianById(request.assigneeId());

        if (Objects.equals(
            previousAssignee == null ? null : previousAssignee.getId(),
            newAssignee == null ? null : newAssignee.getId()
        )) {
            return toResponse(rma);
        }

        rma.setAssignee(newAssignee);
        RmaAssignmentHistory history = addAssignmentHistory(rma, previousAssignee, newAssignee);
        if (newAssignee != null) {
            String eventKey = "RMA_ASSIGNED:" + rma.getId() + ":" + newAssignee.getId() + ":" + history.getChangedAt().toEpochMilli();
            eventPublisher.publishEvent(new RmaNotificationEvent(NotificationEventType.RMA_ASSIGNED, eventKey, rma.getId(), history.getChangedAt(), currentUsername()));
        }
        return toResponse(rmaRecordRepository.save(rma));
    }

    public RmaResponse upsertDiagnosis(Long id, DiagnosisRequest request) {
        RmaRecord rma = getEntityForUpdate(id);
        Diagnosis diagnosis = rma.getDiagnosis();

        if (diagnosis == null) {
            diagnosis = new Diagnosis();
            rma.setDiagnosis(diagnosis);
        }

        diagnosis.setFoundFailure(trim(request.foundFailure()));
        diagnosis.setFailureType(request.failureType());
        diagnosis.setProbableCause(request.probableCause());
        diagnosis.setNotes(trim(request.notes()));
        diagnosis.setDiagnosedAt(request.diagnosedAt());
        diagnosis.setTechnicianName(trim(request.technicianName()));

        return toResponse(rmaRecordRepository.save(rma));
    }

    @Transactional(readOnly = true)
    public RmaRecord getEntityById(Long id) {
        return rmaRecordRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("RMA not found: " + id));
    }

    private RmaRecord getEntityForUpdate(Long id) {
        return rmaRecordRepository.findByIdForUpdate(id).orElseThrow(() -> new ResourceNotFoundException("RMA not found: " + id));
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public RmaResponse block(Long id, RmaBlockRequest request) {
        RmaRecord rma = getEntityForUpdate(id);
        if (rma.getBlockHistory().stream().anyMatch(block -> block.getResolvedAt() == null)) {
            throw new BusinessException("RMA is already blocked.");
        }
        RmaBlock block = new RmaBlock();
        block.setReason(trim(request.reason()));
        block.setCategory(trimToNull(request.category()));
        block.setBlockedBy(currentUsername());
        block.setBlockedAt(Instant.now());
        rma.addBlock(block);
        rma.setUpdatedAt(block.getBlockedAt());
        return toResponse(rmaRecordRepository.save(rma));
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public RmaResponse resolveBlock(Long id, Long blockId, RmaBlockResolveRequest request) {
        RmaRecord rma = getEntityForUpdate(id);
        RmaBlock block = rma.getBlockHistory().stream().filter(item -> item.getId().equals(blockId)).findFirst()
            .orElseThrow(() -> new ResourceNotFoundException("RMA block not found: " + blockId));
        if (block.getResolvedAt() != null) throw new BusinessException("RMA block is no longer active.");
        block.setResolutionNote(trim(request.resolutionNote()));
        block.setResolvedBy(currentUsername());
        block.setResolvedAt(Instant.now());
        rma.setUpdatedAt(block.getResolvedAt());
        return toResponse(rmaRecordRepository.save(rma));
    }

    private List<RmaItem> buildItems(List<RmaItemRequest> requests) {
        if (requests == null || requests.isEmpty()) {
            throw new BusinessException("At least one product must be provided.");
        }
        if (requests.stream().anyMatch(Objects::isNull)) {
            throw new BusinessException("Each RMA item must be provided.");
        }

        return requests.stream().map(request -> {
            RmaItem item = new RmaItem();
            item.setProduct(productService.getEntityById(request.productId()));
            item.setWarrantyMonths(item.getProduct().getDefaultWarrantyMonths());
            applyTrackableFields(item.getItemIdentification(), request.batchNumber(), request.serialNumber(), request.manufacturedAt());
            if (item.getItemIdentification().isEmpty()) {
                throw new BusinessException("Each product must have at least a batch number or serial number.");
            }
            return item;
        }).toList();
    }

    private void replaceItemsPreservingWarranty(RmaRecord rma, List<RmaItemRequest> requests) {
        List<RmaItem> available = new ArrayList<>(rma.getItems());
        List<RmaItem> replacements = buildItems(requests).stream().map(candidate -> {
            RmaItem existing = available.stream().filter(item ->
                Objects.equals(item.getProduct().getId(), candidate.getProduct().getId())
                    && Objects.equals(item.getItemIdentification().getBatchNumber(), candidate.getItemIdentification().getBatchNumber())
                    && Objects.equals(item.getItemIdentification().getSerialNumber(), candidate.getItemIdentification().getSerialNumber()))
                .findFirst().orElse(null);
            if (existing == null) return candidate;
            available.remove(existing);
            existing.getItemIdentification().setManufacturedAt(candidate.getItemIdentification().getManufacturedAt());
            return existing;
        }).toList();
        // A ordem do request é mantida (replaceItems grava a posição): o primeiro continua sendo o item principal.
        if (available.stream().anyMatch(item -> !item.getWarrantyHistory().isEmpty())) {
            throw new BusinessException("Não é possível remover um item com histórico de ajuste de garantia.");
        }
        rma.replaceItems(replacements);
    }

    private void syncLegacyItem(RmaRecord rma) {
        RmaItem firstItem = rma.getItems().get(0);
        rma.setProduct(firstItem.getProduct());
        applyTrackableFields(
            rma.getItemIdentification(),
            firstItem.getItemIdentification().getBatchNumber(),
            firstItem.getItemIdentification().getSerialNumber(),
            firstItem.getItemIdentification().getManufacturedAt()
        );
    }

    private void applyTrackableFields(ItemIdentification itemIdentification, String batchNumber, String serialNumber, LocalDate manufacturedAt) {
        itemIdentification.setBatchNumber(trimToNull(batchNumber));
        itemIdentification.setSerialNumber(trimToNull(serialNumber));
        itemIdentification.setManufacturedAt(manufacturedAt);
    }

    private void applyCommonFields(
        RmaRecord rma,
        LocalDate purchaseDate,
        Boolean purchaseDateUnknown,
        LocalDate entryDate,
        String invoiceNumber,
        String reportedFailure,
        String receivedAccessories,
        String physicalCondition,
        String repairSummary,
        String replacedPartsSummary,
        String testSummary,
        LocalDate shippedAt,
        String carrier,
        String trackingCode
    ) {
        if (purchaseDate != null) {
            rma.setPurchaseDate(purchaseDate);
        }
        if (purchaseDateUnknown != null) {
            rma.setPurchaseDateUnknown(purchaseDateUnknown);
            if (purchaseDateUnknown) {
                rma.setPurchaseDate(null);
            }
        }
        if (entryDate != null) {
            rma.setEntryDate(entryDate);
        }
        if (invoiceNumber != null) {
            rma.setInvoiceNumber(trimToNull(invoiceNumber));
        }
        if (reportedFailure != null) {
            rma.setReportedFailure(trim(reportedFailure));
        }
        if (receivedAccessories != null) {
            rma.setReceivedAccessories(trimToNull(receivedAccessories));
        }
        if (physicalCondition != null) {
            rma.setPhysicalCondition(trimToNull(physicalCondition));
        }
        if (repairSummary != null) {
            rma.setRepairSummary(trimToNull(repairSummary));
        }
        if (replacedPartsSummary != null) {
            rma.setReplacedPartsSummary(trimToNull(replacedPartsSummary));
        }
        if (testSummary != null) {
            rma.setTestSummary(trimToNull(testSummary));
        }
        if (shippedAt != null) {
            rma.setShippedAt(shippedAt);
        }
        if (carrier != null) {
            rma.setCarrier(trimToNull(carrier));
        }
        if (trackingCode != null) {
            rma.setTrackingCode(trimToNull(trackingCode));
        }
    }

    private void validateMandatoryFields(RmaRecord rma) {
        if (rma.getItems().isEmpty() && (rma.getProduct() == null || rma.getItemIdentification().isEmpty())) {
            throw new BusinessException("At least one identified product must be provided.");
        }
        if (rma.getItems().stream().anyMatch(item -> item.getProduct() == null || item.getItemIdentification().isEmpty())) {
            throw new BusinessException("Each product must have at least a batch number or serial number.");
        }
        if (rma.getPurchaseDate() == null && !rma.isPurchaseDateUnknown()) {
            throw new BusinessException("Provide a purchase date or mark it as unknown.");
        }
        if (rma.getPurchaseDate() != null && rma.isPurchaseDateUnknown()) {
            throw new BusinessException("Purchase date cannot be informed and unknown at the same time.");
        }
        if (rma.getClient() == null) {
            throw new BusinessException("Client is required.");
        }
        if (rma.getEntryDate() == null || trimToNull(rma.getReportedFailure()) == null || trimToNull(rma.getReceivedBy()) == null) {
            throw new BusinessException("Entry date, receiver and reported failure are required.");
        }
    }

    private void validateDates(RmaRecord rma) {
        LocalDate today = LocalDate.now(BUSINESS_ZONE);
        LocalDate legacyManufacturedAt = rma.getItemIdentification().getManufacturedAt();
        List<LocalDate> manufacturedDates = rma.getItems().isEmpty()
            ? (legacyManufacturedAt == null ? List.of() : List.of(legacyManufacturedAt))
            : rma.getItems().stream()
                .map(RmaItem::getItemIdentification)
                .map(ItemIdentification::getManufacturedAt)
                .filter(Objects::nonNull)
                .toList();

        if (manufacturedDates.stream().anyMatch(date -> date.isAfter(today))) {
            throw new BusinessException("Manufacturing date cannot be after today.");
        }
        if (rma.getPurchaseDate() != null && rma.getPurchaseDate().isAfter(today)) {
            throw new BusinessException("Purchase date cannot be after today.");
        }
        if (rma.getPurchaseDate() != null && manufacturedDates.stream().anyMatch(date -> rma.getPurchaseDate().isBefore(date))) {
            throw new BusinessException("Purchase date cannot be before manufacturing date.");
        }
        if (rma.getPurchaseDate() != null && rma.getEntryDate().isBefore(rma.getPurchaseDate())) {
            throw new BusinessException("Entry date cannot be before purchase date.");
        }
        if (manufacturedDates.stream().anyMatch(date -> rma.getEntryDate().isBefore(date))) {
            throw new BusinessException("Entry date cannot be before manufacturing date.");
        }
        if (rma.getDueDate() != null && rma.getDueDate().isBefore(rma.getEntryDate())) {
            throw new BusinessException("Due date cannot be before entry date.");
        }
    }

    private void addStatusHistory(RmaRecord rma, RmaStatus status, String note) {
        RmaStatusHistory history = new RmaStatusHistory();
        history.setStatus(status);
        history.setChangedBy(currentUsername());
        history.setChangedAt(Instant.now());
        history.setNote(trimToNull(note));
        rma.addStatusHistory(history);
    }

    private RmaAssignmentHistory addAssignmentHistory(RmaRecord rma, UserAccount previousAssignee, UserAccount newAssignee) {
        RmaAssignmentHistory history = new RmaAssignmentHistory();
        history.setPreviousAssigneeId(previousAssignee == null ? null : previousAssignee.getId());
        history.setPreviousAssigneeName(previousAssignee == null ? null : previousAssignee.getFullName());
        history.setNewAssigneeId(newAssignee == null ? null : newAssignee.getId());
        history.setNewAssigneeName(newAssignee == null ? null : newAssignee.getFullName());
        history.setChangedBy(currentUsername());
        history.setChangedAt(Instant.now());
        rma.addAssignmentHistory(history);
        return history;
    }

    private void addDueDateHistory(RmaRecord rma, LocalDate previous, LocalDate next) {
        RmaDueDateHistory history = new RmaDueDateHistory();
        history.setPreviousDueDate(previous);
        history.setNewDueDate(next);
        history.setChangedBy(currentUsername());
        history.setChangedAt(Instant.now());
        rma.addDueDateHistory(history);
    }

    private String generateNextCode() {
        // Held until create commits or rolls back, including the RMA insert.
        rmaCodeGenerationLockRepository.lockForCodeGeneration()
            .orElseThrow(() -> new IllegalStateException("RMA code generation lock is missing"));
        int year = LocalDate.now(BUSINESS_ZONE).getYear();
        String prefix = "RMA-" + year + "-";

        int nextValue = rmaRecordRepository.findTopByCodeStartingWithOrderByCodeDesc(prefix)
            .map(RmaRecord::getCode)
            .map(this::extractSequence)
            .map(sequence -> sequence + 1)
            .orElse(1);

        if (nextValue > MAX_YEARLY_SEQUENCE) {
            throw new BusinessException("Annual RMA code capacity reached.");
        }

        return prefix + String.format("%06d", nextValue);
    }

    private int extractSequence(String code) {
        return Integer.parseInt(code.substring(code.lastIndexOf('-') + 1));
    }

    private RmaPriority defaultPriority(RmaPriority priority) {
        return priority == null ? RmaPriority.MEDIUM : priority;
    }

    private String currentUsername() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            return "system";
        }
        return authentication.getName();
    }

    private RmaResponse toResponse(RmaRecord rma) {
        Instant now = Instant.now();
        return RmaResponse.from(rma, rmaStageTimeService.periods(rma, now), rmaDeadlineService.evaluate(rma, RmaDeadlineService.businessDate(now)));
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }

        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String trim(String value) {
        return value == null ? null : value.trim();
    }
}
