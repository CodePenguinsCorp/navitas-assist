package br.com.navitasassist.service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Objects;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.controller.ResourceNotFoundException;
import br.com.navitasassist.diagnosis.Diagnosis;
import br.com.navitasassist.diagnosis.DiagnosisRequest;
import br.com.navitasassist.item.ItemIdentification;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.rma.CreateRmaRequest;
import br.com.navitasassist.rma.RmaAssigneeUpdateRequest;
import br.com.navitasassist.rma.RmaAssignmentHistory;
import br.com.navitasassist.rma.RmaItem;
import br.com.navitasassist.rma.RmaItemRequest;
import br.com.navitasassist.rma.RmaPriority;
import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.rma.RmaResponse;
import br.com.navitasassist.rma.RmaStatus;
import br.com.navitasassist.rma.RmaStatusHistory;
import br.com.navitasassist.rma.RmaStatusUpdateRequest;
import br.com.navitasassist.rma.UpdateRmaRequest;
import br.com.navitasassist.user.UserAccount;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class RmaService {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Sao_Paulo");

    private final RmaRecordRepository rmaRecordRepository;
    private final RmaSlaService rmaSlaService;
    private final ClientService clientService;
    private final ProductService productService;
    private final UserAccountService userAccountService;

    @Transactional(readOnly = true)
    public List<RmaResponse> search(String query, RmaStatus status) {
        return rmaRecordRepository.search(trimToNull(query), status).stream().map(this::toResponse).toList();
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

        return rmaRecordRepository.findHistory(normalizedBatch, normalizedSerial)
            .stream()
            .map(this::toResponse)
            .toList();
    }

    public RmaResponse create(CreateRmaRequest request) {
        Client client = clientService.getEntityById(request.clientId());
        List<RmaItem> items = buildItems(request.items());

        RmaRecord rma = new RmaRecord();
        rma.setCode(generateNextCode());
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
        validateMandatoryFields(rma);
        validateDates(rma);
        addStatusHistory(rma, RmaStatus.RECEIVED, "RMA created");

        return toResponse(rmaRecordRepository.save(rma));
    }

    public RmaResponse update(Long id, UpdateRmaRequest request) {
        RmaRecord rma = getEntityById(id);

        if (request.clientId() != null) {
            rma.setClient(clientService.getEntityById(request.clientId()));
        }
        if (request.items() != null) {
            rma.replaceItems(buildItems(request.items()));
            syncLegacyItem(rma);
        }
        if (request.priority() != null) {
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

        validateMandatoryFields(rma);
        validateDates(rma);

        return toResponse(rmaRecordRepository.save(rma));
    }

    public RmaResponse updateStatus(Long id, RmaStatusUpdateRequest request) {
        RmaRecord rma = getEntityById(id);
        boolean changed = !Objects.equals(rma.getStatus(), request.status());

        if (changed) {
            rma.setStatus(request.status());
        }
        if (changed || trimToNull(request.note()) != null) {
            addStatusHistory(rma, request.status(), request.note());
        }

        return toResponse(rmaRecordRepository.save(rma));
    }

    public RmaResponse updateAssignee(Long id, RmaAssigneeUpdateRequest request) {
        RmaRecord rma = getEntityById(id);
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
        addAssignmentHistory(rma, previousAssignee, newAssignee);
        return toResponse(rmaRecordRepository.save(rma));
    }

    public RmaResponse upsertDiagnosis(Long id, DiagnosisRequest request) {
        RmaRecord rma = getEntityById(id);
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
    }

    private void addStatusHistory(RmaRecord rma, RmaStatus status, String note) {
        RmaStatusHistory history = new RmaStatusHistory();
        history.setStatus(status);
        history.setChangedBy(currentUsername());
        history.setChangedAt(Instant.now());
        history.setNote(trimToNull(note));
        rma.addStatusHistory(history);
    }

    private void addAssignmentHistory(RmaRecord rma, UserAccount previousAssignee, UserAccount newAssignee) {
        RmaAssignmentHistory history = new RmaAssignmentHistory();
        history.setPreviousAssigneeId(previousAssignee == null ? null : previousAssignee.getId());
        history.setPreviousAssigneeName(previousAssignee == null ? null : previousAssignee.getFullName());
        history.setNewAssigneeId(newAssignee == null ? null : newAssignee.getId());
        history.setNewAssigneeName(newAssignee == null ? null : newAssignee.getFullName());
        history.setChangedBy(currentUsername());
        history.setChangedAt(Instant.now());
        rma.addAssignmentHistory(history);
    }

    private String generateNextCode() {
        int year = LocalDate.now(BUSINESS_ZONE).getYear();
        String prefix = "RMA-" + year + "-";

        int nextValue = rmaRecordRepository.findTopByCodeStartingWithOrderByCodeDesc(prefix)
            .map(RmaRecord::getCode)
            .map(this::extractSequence)
            .map(sequence -> sequence + 1)
            .orElse(1);

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
        return RmaResponse.from(rma, rmaSlaService.calculate(rma, Instant.now()));
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
