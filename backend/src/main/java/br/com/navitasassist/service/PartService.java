package br.com.navitasassist.service;

import java.util.List;

import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.controller.ResourceNotFoundException;
import br.com.navitasassist.part.Part;
import br.com.navitasassist.part.PartRequest;
import br.com.navitasassist.part.PartResponse;
import br.com.navitasassist.repository.PartRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class PartService {

    private final PartRepository partRepository;

    @Transactional(readOnly = true)
    public List<PartResponse> search(String query) {
        return partRepository.search(trimToNull(query)).stream().map(PartResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public PartResponse getById(Long id) {
        return PartResponse.from(getEntityById(id));
    }

    public PartResponse create(PartRequest request) {
        validateCode(null, request.code());

        Part part = new Part();
        apply(part, request);
        return PartResponse.from(partRepository.save(part));
    }

    /**
     * Updates registration data only. Balances change exclusively through stock movements.
     */
    public PartResponse update(Long id, PartRequest request) {
        // Locked like stock movements, so saving the full row cannot overwrite a concurrently changed balance.
        Part part = partRepository.findByIdForUpdate(id).orElseThrow(() -> new ResourceNotFoundException("Part not found: " + id));
        validateCode(part, request.code());

        apply(part, request);
        return PartResponse.from(partRepository.save(part));
    }

    @Transactional(readOnly = true)
    public Part getEntityById(Long id) {
        return partRepository.findById(id).orElseThrow(() -> new ResourceNotFoundException("Part not found: " + id));
    }

    private void validateCode(Part existing, String code) {
        String normalized = code.trim();
        boolean duplicate = partRepository.existsByCodeIgnoreCase(normalized) && (existing == null || !existing.getCode().equalsIgnoreCase(normalized));

        if (duplicate) {
            throw new BusinessException("Part code already registered: " + normalized);
        }
    }

    private void apply(Part part, PartRequest request) {
        part.setCode(request.code().trim());
        part.setName(request.name().trim());
        part.setUnit(request.unit().trim());
        part.setLocation(trimToNull(request.location()));
        part.setMinimumStock(request.minimumStock());
        part.setUnitCost(request.unitCost());
        if (request.active() != null) {
            part.setActive(request.active());
        }
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }

        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
