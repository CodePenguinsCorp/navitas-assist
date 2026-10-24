package br.com.navitasassist.service;

import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import br.com.navitasassist.config.CustodyProperties;
import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.controller.ResourceNotFoundException;
import br.com.navitasassist.custody.CustodyFlag;
import br.com.navitasassist.custody.CustodyMovementRequest;
import br.com.navitasassist.custody.CustodyMovementResponse;
import br.com.navitasassist.custody.CustodyMovementType;
import br.com.navitasassist.custody.RmaCustodyDetailResponse;
import br.com.navitasassist.custody.RmaCustodyMovement;
import br.com.navitasassist.custody.RmaCustodyResponse;
import br.com.navitasassist.custody.StorageLocation;
import br.com.navitasassist.repository.RmaCustodyMovementRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.rma.RmaStatus;
import br.com.navitasassist.user.AssignableUserResponse;
import br.com.navitasassist.user.UserAccount;
import br.com.navitasassist.user.UserRole;
import lombok.RequiredArgsConstructor;
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

    @Transactional(readOnly = true)
    public List<RmaCustodyResponse> search(Long locationId, CustodyFlag flag) {
        Instant now = Instant.now();
        Map<Long, RmaCustodyMovement> latestByRma = rmaCustodyMovementRepository.findLatestPerRma()
            .stream()
            .collect(Collectors.toMap(movement -> movement.getRma().getId(), Function.identity()));
        Set<Long> locationIds = locationId == null ? null : storageLocationService.subtreeIds(storageLocationService.getEntityById(locationId));

        return rmaRecordRepository.findAll().stream()
            .filter(rma -> isTracked(rma, latestByRma.get(rma.getId())))
            .filter(rma -> locationIds == null || isInside(latestByRma.get(rma.getId()), locationIds))
            .map(rma -> RmaCustodyResponse.from(rma, latestByRma.get(rma.getId()), flagFor(rma, latestByRma.get(rma.getId()), now)))
            .filter(response -> flag == null || response.flag() == flag)
            .sorted(Comparator.comparing(RmaCustodyResponse::rmaCode))
            .toList();
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
        for (StorageLocation location = destination; location != null; location = location.getParent()) {
            if (!location.isActive()) {
                throw new BusinessException("Inactive locations cannot receive equipment.");
            }
        }
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

    private boolean isTracked(RmaRecord rma, RmaCustodyMovement latest) {
        return !FINISHED_STATUSES.contains(rma.getStatus()) || (latest != null && latest.getToLocation() != null);
    }

    private boolean isInside(RmaCustodyMovement latest, Set<Long> locationIds) {
        return latest != null && latest.getToLocation() != null && locationIds.contains(latest.getToLocation().getId());
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
