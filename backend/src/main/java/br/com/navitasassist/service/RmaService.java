package br.com.navitasassist.service;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Objects;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.controller.ResourceNotFoundException;
import br.com.navitasassist.diagnosis.Diagnosis;
import br.com.navitasassist.diagnosis.DiagnosisRequest;
import br.com.navitasassist.item.ItemIdentification;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.rma.CreateRmaRequest;
import br.com.navitasassist.rma.RmaPriority;
import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.rma.RmaResponse;
import br.com.navitasassist.rma.RmaStatus;
import br.com.navitasassist.rma.RmaStatusHistory;
import br.com.navitasassist.rma.RmaStatusUpdateRequest;
import br.com.navitasassist.rma.UpdateRmaRequest;
import br.com.navitasassist.rma.WarrantyStatus;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class RmaService {

    private final RmaRecordRepository rmaRecordRepository;
    private final ClientService clientService;
    private final ProductService productService;

    @Transactional(readOnly = true)
    public List<RmaResponse> search(String query, RmaStatus status) {
        return rmaRecordRepository.search(trimToNull(query), status).stream().map(RmaResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public RmaResponse getById(Long id) {
        return RmaResponse.from(getEntityById(id));
    }

    @Transactional(readOnly = true)
    public RmaResponse getByCode(String code) {
        return RmaResponse.from(rmaRecordRepository.findByCodeIgnoreCase(code)
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
            .map(RmaResponse::from)
            .toList();
    }

    public RmaResponse create(CreateRmaRequest request) {
        Client client = clientService.getEntityById(request.clientId());
        Product product = productService.getEntityById(request.productId());

        RmaRecord rma = new RmaRecord();
        rma.setCode(generateNextCode());
        rma.setClient(client);
        rma.setProduct(product);
        rma.setStatus(RmaStatus.RECEIVED);
        rma.setPriority(defaultPriority(request.priority()));

        applyTrackableFields(rma.getItemIdentification(), request.batchNumber(), request.serialNumber(), request.manufacturedAt());
        applyCommonFields(
            rma,
            request.purchaseDate(),
            request.purchaseDateUnknown(),
            request.entryDate(),
            request.invoiceNumber(),
            request.invoiceFileName(),
            request.receivedBy(),
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
        applyWarranty(rma, request.warrantyStatusOverride(), request.warrantyJustification());
        addStatusHistory(rma, RmaStatus.RECEIVED, "RMA created");

        return RmaResponse.from(rmaRecordRepository.save(rma));
    }

    public RmaResponse update(Long id, UpdateRmaRequest request) {
        RmaRecord rma = getEntityById(id);

        if (request.clientId() != null) {
            rma.setClient(clientService.getEntityById(request.clientId()));
        }
        if (request.productId() != null) {
            rma.setProduct(productService.getEntityById(request.productId()));
        }
        if (request.batchNumber() != null) {
            rma.getItemIdentification().setBatchNumber(trimToNull(request.batchNumber()));
        }
        if (request.serialNumber() != null) {
            rma.getItemIdentification().setSerialNumber(trimToNull(request.serialNumber()));
        }
        if (request.manufacturedAt() != null) {
            rma.getItemIdentification().setManufacturedAt(request.manufacturedAt());
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
            request.invoiceFileName(),
            request.receivedBy(),
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

        boolean shouldRecalculateWarranty = request.purchaseDate() != null
            || request.purchaseDateUnknown() != null
            || request.entryDate() != null
            || request.productId() != null;

        if (request.warrantyStatusOverride() != null) {
            applyWarranty(rma, request.warrantyStatusOverride(), request.warrantyJustification());
        } else if (shouldRecalculateWarranty && !rma.isWarrantyOverridden()) {
            applyWarranty(rma, null, null);
        }

        return RmaResponse.from(rmaRecordRepository.save(rma));
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

        return RmaResponse.from(rmaRecordRepository.save(rma));
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

        return RmaResponse.from(rmaRecordRepository.save(rma));
    }

    @Transactional(readOnly = true)
    public RmaRecord getEntityById(Long id) {
        return rmaRecordRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("RMA not found: " + id));
    }

    private void applyTrackableFields(
        ItemIdentification itemIdentification,
        String batchNumber,
        String serialNumber,
        LocalDate manufacturedAt
    ) {
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
        String invoiceFileName,
        String receivedBy,
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
        if (invoiceFileName != null) {
            rma.setInvoiceFileName(trimToNull(invoiceFileName));
        }
        if (receivedBy != null) {
            rma.setReceivedBy(trim(receivedBy));
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
        if (rma.getItemIdentification().isEmpty()) {
            throw new BusinessException("At least batch number or serial number must be provided.");
        }
        if (rma.getPurchaseDate() == null && !rma.isPurchaseDateUnknown()) {
            throw new BusinessException("Provide a purchase date or mark it as unknown.");
        }
        if (rma.getPurchaseDate() != null && rma.isPurchaseDateUnknown()) {
            throw new BusinessException("Purchase date cannot be informed and unknown at the same time.");
        }
        if (rma.getClient() == null || rma.getProduct() == null) {
            throw new BusinessException("Client and product are required.");
        }
        if (rma.getEntryDate() == null || trimToNull(rma.getReportedFailure()) == null || trimToNull(rma.getReceivedBy()) == null) {
            throw new BusinessException("Entry date, receiver and reported failure are required.");
        }
    }

    private void applyWarranty(RmaRecord rma, WarrantyStatus overrideStatus, String justification) {
        String actor = currentUsername();

        if (overrideStatus != null) {
            if (trimToNull(justification) == null) {
                throw new BusinessException("Warranty override requires a justification.");
            }
            rma.setWarrantyStatus(overrideStatus);
            rma.setWarrantyOverridden(true);
            rma.setWarrantyJustification(trim(justification));
        } else {
            rma.setWarrantyStatus(calculateWarranty(rma));
            rma.setWarrantyOverridden(false);
            rma.setWarrantyJustification(null);
        }

        rma.setWarrantyUpdatedBy(actor);
        rma.setWarrantyUpdatedAt(Instant.now());
    }

    private WarrantyStatus calculateWarranty(RmaRecord rma) {
        if (rma.isPurchaseDateUnknown() || rma.getPurchaseDate() == null) {
            return WarrantyStatus.PENDING;
        }

        LocalDate warrantyLimit = rma.getPurchaseDate().plusMonths(rma.getProduct().getDefaultWarrantyMonths());
        return warrantyLimit.isBefore(rma.getEntryDate())
            ? WarrantyStatus.OUT_OF_WARRANTY
            : WarrantyStatus.IN_WARRANTY;
    }

    private void addStatusHistory(RmaRecord rma, RmaStatus status, String note) {
        RmaStatusHistory history = new RmaStatusHistory();
        history.setStatus(status);
        history.setChangedBy(currentUsername());
        history.setChangedAt(Instant.now());
        history.setNote(trimToNull(note));
        rma.addStatusHistory(history);
    }

    private String generateNextCode() {
        int year = LocalDate.now().getYear();
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
