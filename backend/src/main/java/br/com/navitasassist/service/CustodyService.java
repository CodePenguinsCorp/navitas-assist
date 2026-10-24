package br.com.navitasassist.service;

import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;

import br.com.navitasassist.config.CustodyProperties;
import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.controller.ResourceNotFoundException;
import br.com.navitasassist.custody.CustodyFlag;
import br.com.navitasassist.custody.CustodyMovementRequest;
import br.com.navitasassist.custody.CustodyMovementResponse;
import br.com.navitasassist.custody.CustodyMovementType;
import br.com.navitasassist.custody.CustodySummaryResponse;
import br.com.navitasassist.custody.RmaCustodyDetailResponse;
import br.com.navitasassist.custody.RmaCustodyMovement;
import br.com.navitasassist.custody.RmaCustodyResponse;
import br.com.navitasassist.custody.RmaCustodyRow;
import br.com.navitasassist.custody.StorageLocation;
import br.com.navitasassist.pagination.PageParams;
import br.com.navitasassist.pagination.PageResponse;
import br.com.navitasassist.repository.RmaCustodyMovementRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.rma.RmaStatus;
import br.com.navitasassist.user.AssignableUserResponse;
import br.com.navitasassist.user.UserAccount;
import br.com.navitasassist.user.UserRole;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Tracks where each RMA physically is and who holds its custody.
 * Movements are always registered through {@link #move(Long, CustodyMovementRequest)}; a future label (QR Code)
 * reader must resolve the RMA and call the same endpoint, so it is subject to the same permissions and rules.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class CustodyService {

    private static final Set<RmaStatus> FINISHED_STATUSES = Set.of(RmaStatus.COMPLETED, RmaStatus.RETURNED, RmaStatus.IRREPARABLE);

    private final RmaCustodyMovementRepository rmaCustodyMovementRepository;
    private final RmaRecordRepository rmaRecordRepository;
    private final UserAccountRepository userAccountRepository;
    private final StorageLocationService storageLocationService;
    private final CustodyProperties custodyProperties;
    private final EntityManager entityManager;

    @Transactional(readOnly = true)
    public PageResponse<RmaCustodyResponse> search(Long locationId, CustodyFlag flag, String query, Integer page, Integer size) {
        Instant staleBefore = staleBefore();
        Page<RmaCustodyRow> rows = searchRows(locationId, flag, trimToNull(query), staleBefore, PageParams.of(page, size));
        return PageResponse.from(rows, row -> RmaCustodyResponse.from(row, flagFor(row, staleBefore)));
    }

    @Transactional(readOnly = true)
    public CustodySummaryResponse summarize(Long locationId) {
        Instant staleBefore = staleBefore();
        Pageable countOnly = PageParams.of(0, 1);
        return new CustodySummaryResponse(
            searchRows(locationId, null, null, staleBefore, countOnly).getTotalElements(),
            searchRows(locationId, CustodyFlag.MISSING, null, staleBefore, countOnly).getTotalElements(),
            searchRows(locationId, CustodyFlag.STALE, null, staleBefore, countOnly).getTotalElements()
        );
    }

    @Transactional(readOnly = true)
    public RmaCustodyDetailResponse getDetail(Long rmaId) {
        RmaRecord rma = rmaRecordRepository.findById(rmaId).orElseThrow(() -> new ResourceNotFoundException("RMA not found: " + rmaId));
        return toDetail(rma);
    }

    @Transactional(readOnly = true)
    public List<AssignableUserResponse> listCustodians() {
        return userAccountRepository.findAllByActiveTrueAndRoleNotOrderByFullNameAsc(UserRole.VIEWER)
            .stream()
            .map(AssignableUserResponse::from)
            .toList();
    }

    public RmaCustodyDetailResponse move(Long rmaId, CustodyMovementRequest request) {
        RmaRecord rma = rmaRecordRepository.findByIdForUpdate(rmaId).orElseThrow(() -> new ResourceNotFoundException("RMA not found: " + rmaId));
        StorageLocation currentLocation = rmaCustodyMovementRepository.findTopByRma_IdOrderByIdDesc(rmaId)
            .map(RmaCustodyMovement::getToLocation)
            .orElse(null);

        RmaCustodyMovement movement = new RmaCustodyMovement();
        movement.setRma(rma);
        movement.setType(request.type());
        movement.setFromLocation(currentLocation);
        movement.setReason(trimToNull(request.reason()));
        movement.setPerformedBy(currentUsername());
        movement.setPerformedAt(Instant.now());

        if (request.type() == CustodyMovementType.EXIT) {
            validateExit(rma, currentLocation, request);
        } else {
            StorageLocation destination = resolveDestination(request, currentLocation);
            assertLocationAvailable(destination);
            UserAccount custodian = resolveCustodian(request.custodianId());
            movement.setToLocation(destination);
            movement.setCustodianId(custodian.getId());
            movement.setCustodianName(custodian.getFullName());
        }

        rmaCustodyMovementRepository.save(movement);
        return toDetail(rma);
    }

    private StorageLocation resolveDestination(CustodyMovementRequest request, StorageLocation currentLocation) {
        if (request.type() == CustodyMovementType.ENTRY && currentLocation != null) {
            throw new BusinessException("The equipment already has a location. Use a transfer instead.");
        }
        if (request.type() == CustodyMovementType.TRANSFER && currentLocation == null) {
            throw new BusinessException("The equipment has no current location. Register an entry first.");
        }
        if (request.toLocationId() == null) {
            throw new BusinessException("Destination location is required.");
        }

        StorageLocation destination = storageLocationService.getEntityById(request.toLocationId());
        if (currentLocation != null && currentLocation.getId().equals(destination.getId())) {
            throw new BusinessException("The equipment is already in this location.");
        }
        return destination;
    }

    private void validateExit(RmaRecord rma, StorageLocation currentLocation, CustodyMovementRequest request) {
        if (currentLocation == null) {
            throw new BusinessException("The equipment has no current location.");
        }
        if (!FINISHED_STATUSES.contains(rma.getStatus())) {
            throw new BusinessException("Only finished RMAs can leave internal custody.");
        }
        if (request.toLocationId() != null || request.custodianId() != null) {
            throw new BusinessException("Exit movements cannot have a destination or custodian.");
        }
    }

    private UserAccount resolveCustodian(Long custodianId) {
        UserAccount custodian = custodianId == null
            ? userAccountRepository.findByUsernameIgnoreCase(currentUsername()).orElseThrow(() -> new BusinessException("Inform the custodian for this movement."))
            : userAccountRepository.findById(custodianId).orElseThrow(() -> new ResourceNotFoundException("User not found: " + custodianId));

        if (!custodian.isActive()) {
            throw new BusinessException("Inactive users cannot take custody of equipment.");
        }
        if (custodian.getRole() == UserRole.VIEWER) {
            throw new BusinessException("Viewers cannot take custody of equipment.");
        }
        return custodian;
    }

    private RmaCustodyDetailResponse toDetail(RmaRecord rma) {
        List<RmaCustodyMovement> movements = rmaCustodyMovementRepository.findAllByRma_IdOrderByPerformedAtDescIdDesc(rma.getId());
        RmaCustodyMovement latest = movements.stream().max(Comparator.comparing(RmaCustodyMovement::getId)).orElse(null);
        return new RmaCustodyDetailResponse(
            RmaCustodyResponse.from(rma, latest, flagFor(rma, latest, Instant.now())),
            movements.stream().map(CustodyMovementResponse::from).toList()
        );
    }

    /**
     * Locks the destination and its ancestors (by id, so concurrent movements lock in the same order) and re-reads them,
     * serializing the check with {@link StorageLocationService#update(Long, br.com.navitasassist.custody.StorageLocationRequest)}.
     */
    private void assertLocationAvailable(StorageLocation destination) {
        List<StorageLocation> chain = new java.util.ArrayList<>();
        for (StorageLocation location = destination; location != null; location = location.getParent()) {
            chain.add(location);
        }
        chain.sort(Comparator.comparing(StorageLocation::getId));
        chain.forEach(location -> entityManager.refresh(location, LockModeType.PESSIMISTIC_WRITE));
        if (chain.stream().anyMatch(location -> !location.isActive())) {
            throw new BusinessException("Inactive locations cannot receive equipment.");
        }
    }

    private Page<RmaCustodyRow> searchRows(Long locationId, CustodyFlag flag, String query, Instant staleBefore, Pageable pageable) {
        Set<Long> locationIds = locationId == null ? Set.of(-1L) : storageLocationService.subtreeIds(storageLocationService.getEntityById(locationId));
        return rmaCustodyMovementRepository.searchTracked(
            FINISHED_STATUSES,
            locationId == null,
            locationIds,
            flag == null || flag == CustodyFlag.MISSING,
            flag == null || flag == CustodyFlag.STALE,
            flag == null || flag == CustodyFlag.OK,
            staleBefore,
            query,
            pageable
        );
    }

    private Instant staleBefore() {
        return Instant.now().minus(Duration.ofHours(custodyProperties.getStaleAfterHours()));
    }

    private CustodyFlag flagFor(RmaCustodyRow row, Instant staleBefore) {
        if (row.locationId() == null) {
            return FINISHED_STATUSES.contains(row.rmaStatus()) ? CustodyFlag.OK : CustodyFlag.MISSING;
        }
        return row.since().isBefore(staleBefore) ? CustodyFlag.STALE : CustodyFlag.OK;
    }

    private CustodyFlag flagFor(RmaRecord rma, RmaCustodyMovement latest, Instant now) {
        boolean located = latest != null && latest.getToLocation() != null;
        if (!located) {
            return FINISHED_STATUSES.contains(rma.getStatus()) ? CustodyFlag.OK : CustodyFlag.MISSING;
        }
        Duration staleAfter = Duration.ofHours(custodyProperties.getStaleAfterHours());
        return latest.getPerformedAt().plus(staleAfter).isBefore(now) ? CustodyFlag.STALE : CustodyFlag.OK;
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
