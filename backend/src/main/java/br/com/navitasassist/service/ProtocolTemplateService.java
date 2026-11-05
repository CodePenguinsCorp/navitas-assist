package br.com.navitasassist.service;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.stream.Stream;

import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.controller.ResourceNotFoundException;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.protocol.ProtocolItemType;
import br.com.navitasassist.protocol.ProtocolTemplate;
import br.com.navitasassist.protocol.ProtocolTemplateItem;
import br.com.navitasassist.protocol.ProtocolTemplateItemRequest;
import br.com.navitasassist.protocol.ProtocolTemplateRequest;
import br.com.navitasassist.protocol.ProtocolTemplateResponse;
import br.com.navitasassist.protocol.ProtocolTemplateVersion;
import br.com.navitasassist.repository.ProtocolTemplateRepository;
import br.com.navitasassist.repository.ProtocolTemplateVersionRepository;
import br.com.navitasassist.rma.RmaItem;
import br.com.navitasassist.rma.RmaRecord;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class ProtocolTemplateService {

    private final ProtocolTemplateRepository protocolTemplateRepository;
    private final ProtocolTemplateVersionRepository protocolTemplateVersionRepository;
    private final ProductService productService;

    @Transactional(readOnly = true)
    public List<ProtocolTemplateResponse> listAll() {
        return protocolTemplateRepository.findAllOrderByName().stream().map(ProtocolTemplateResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public ProtocolTemplateResponse getById(Long id) {
        return ProtocolTemplateResponse.from(getEntityById(id));
    }

    public ProtocolTemplateResponse create(ProtocolTemplateRequest request) {
        ProtocolTemplate template = new ProtocolTemplate();
        applyMetadata(template, request);
        template.addVersion(buildVersion(request, 1));
        return ProtocolTemplateResponse.from(protocolTemplateRepository.save(template));
    }

    /**
     * Editing never touches existing versions: a new version is appended and only new executions use it.
     */
    public ProtocolTemplateResponse update(Long id, ProtocolTemplateRequest request) {
        ProtocolTemplate template = protocolTemplateRepository.findByIdForUpdate(id).orElseThrow(() -> new ResourceNotFoundException("Protocol template not found: " + id));
        applyMetadata(template, request);
        ProtocolTemplateVersion version = buildVersion(request, template.getCurrentVersion() + 1);
        template.addVersion(version);
        protocolTemplateVersionRepository.save(version);
        return ProtocolTemplateResponse.from(protocolTemplateRepository.save(template));
    }

    @Transactional(readOnly = true)
    public ProtocolTemplate getEntityById(Long id) {
        return protocolTemplateRepository.findById(id).orElseThrow(() -> new ResourceNotFoundException("Protocol template not found: " + id));
    }

    @Transactional(readOnly = true)
    public List<ProtocolTemplate> findActiveApplicable(RmaRecord rma) {
        return protocolTemplateRepository.findAllActive().stream().filter(template -> appliesTo(template, rma)).toList();
    }

    public boolean appliesTo(ProtocolTemplate template, RmaRecord rma) {
        List<Product> products = Stream.concat(Stream.of(rma.getProduct()), rma.getItems().stream().map(RmaItem::getProduct)).filter(Objects::nonNull).toList();
        if (template.getProduct() != null) {
            return products.stream().anyMatch(product -> product.getId().equals(template.getProduct().getId()));
        }
        return products.stream().anyMatch(product -> product.getCategory() != null && product.getCategory().trim().equalsIgnoreCase(template.getCategory()));
    }

    private void applyMetadata(ProtocolTemplate template, ProtocolTemplateRequest request) {
        String category = trimToNull(request.category());
        if (request.productId() == null && category == null) {
            throw new BusinessException("Inform a product or a category for the protocol.");
        }
        template.setName(request.name().trim());
        template.setProduct(request.productId() == null ? null : productService.getEntityById(request.productId()));
        template.setCategory(request.productId() == null ? category : null);
        template.setActive(request.active());
    }

    private ProtocolTemplateVersion buildVersion(ProtocolTemplateRequest request, int versionNumber) {
        ProtocolTemplateVersion version = new ProtocolTemplateVersion();
        version.setVersionNumber(versionNumber);
        version.setBlockedStatusSet(request.blockedStatuses());
        version.setCreatedBy(currentUsername());
        version.setCreatedAt(Instant.now());
        request.items().forEach(itemRequest -> version.addItem(buildItem(itemRequest)));
        return version;
    }

    private ProtocolTemplateItem buildItem(ProtocolTemplateItemRequest request) {
        ProtocolTemplateItem item = new ProtocolTemplateItem();
        item.setStepName(request.stepName().trim());
        item.setTitle(request.title().trim());
        item.setInstructions(trimToNull(request.instructions()));
        item.setType(request.type());
        item.setRequired(request.required());
        item.setExpectedResult(trimToNull(request.expectedResult()));
        item.setEvidenceRequired(request.evidenceRequired());

        if (request.type() != ProtocolItemType.MEASUREMENT) {
            return item;
        }

        String unit = trimToNull(request.unit());
        if (unit == null || request.decimalPlaces() == null) {
            throw new BusinessException("Measurement items require a unit and a number of decimal places: " + item.getTitle());
        }
        validateLimit(request.minValue(), request.decimalPlaces(), item.getTitle());
        validateLimit(request.maxValue(), request.decimalPlaces(), item.getTitle());
        if (request.minValue() != null && request.maxValue() != null && request.minValue().compareTo(request.maxValue()) > 0) {
            throw new BusinessException("Minimum value cannot be greater than maximum value: " + item.getTitle());
        }
        item.setUnit(unit);
        item.setDecimalPlaces(request.decimalPlaces());
        item.setMinValue(request.minValue());
        item.setMaxValue(request.maxValue());
        return item;
    }

    private void validateLimit(BigDecimal value, int decimalPlaces, String title) {
        if (value != null && Math.max(value.stripTrailingZeros().scale(), 0) > decimalPlaces) {
            throw new BusinessException("Limits must use at most " + decimalPlaces + " decimal places: " + title);
        }
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
