package br.com.navitasassist.service;

import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.controller.ResourceNotFoundException;
import br.com.navitasassist.custody.StorageLocation;
import br.com.navitasassist.custody.StorageLocationRequest;
import br.com.navitasassist.custody.StorageLocationResponse;
import br.com.navitasassist.repository.RmaCustodyMovementRepository;
import br.com.navitasassist.repository.StorageLocationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class StorageLocationService {

    private final StorageLocationRepository storageLocationRepository;
    private final RmaCustodyMovementRepository rmaCustodyMovementRepository;

    @Transactional(readOnly = true)
    public List<StorageLocationResponse> listAll() {
        return storageLocationRepository.findAllOrderByCode().stream().map(StorageLocationResponse::from).toList();
    }

    public StorageLocationResponse create(StorageLocationRequest request) {
        String code = normalizeCode(request.code());
        validateCode(null, code);

        StorageLocation location = new StorageLocation();
        apply(location, request, code);
        return StorageLocationResponse.from(storageLocationRepository.save(location));
    }

    public StorageLocationResponse update(Long id, StorageLocationRequest request) {
        StorageLocation location = getEntityById(id);
        String code = normalizeCode(request.code());
        validateCode(location, code);

        if (location.isActive() && !request.active() && rmaCustodyMovementRepository.isAnyLocationOccupied(subtreeIds(location))) {
            throw new BusinessException("A location holding equipment cannot be deactivated.");
        }

        apply(location, request, code);
        return StorageLocationResponse.from(storageLocationRepository.save(location));
    }

    @Transactional(readOnly = true)
    public Set<Long> subtreeIds(StorageLocation root) {
        List<StorageLocation> locations = storageLocationRepository.findAll();
        Set<Long> ids = new HashSet<>(Set.of(root.getId()));
        boolean added = true;
        while (added) {
            added = false;
            for (StorageLocation location : locations) {
                StorageLocation parent = location.getParent();
                if (parent != null && ids.contains(parent.getId()) && ids.add(location.getId())) {
                    added = true;
                }
            }
        }
        return ids;
    }

    @Transactional(readOnly = true)
    public StorageLocation getEntityById(Long id) {
        return storageLocationRepository.findById(id).orElseThrow(() -> new ResourceNotFoundException("Location not found: " + id));
    }

    private void apply(StorageLocation location, StorageLocationRequest request, String code) {
        location.setCode(code);
        location.setName(request.name().trim());
        location.setType(request.type());
        location.setParent(resolveParent(location, request.parentId()));
        location.setDescription(trimToNull(request.description()));
        location.setActive(request.active());
    }

    private StorageLocation resolveParent(StorageLocation location, Long parentId) {
        if (parentId == null) {
            return null;
        }
        if (parentId.equals(location.getId())) {
            throw new BusinessException("A location cannot be its own parent.");
        }

        StorageLocation parent = getEntityById(parentId);
        for (StorageLocation ancestor = parent; ancestor != null; ancestor = ancestor.getParent()) {
            if (location.getId() != null && location.getId().equals(ancestor.getId())) {
                throw new BusinessException("A location cannot be placed inside one of its own sublocations.");
            }
        }
        return parent;
    }

    private void validateCode(StorageLocation existing, String code) {
        boolean duplicate = storageLocationRepository.existsByCodeIgnoreCase(code)
            && (existing == null || !existing.getCode().equalsIgnoreCase(code));

        if (duplicate) {
            throw new BusinessException("Location code already registered: " + code);
        }
    }

    private String normalizeCode(String code) {
        return code.trim().toUpperCase(Locale.ROOT);
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }

        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
