package br.com.navitasassist.service;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Stream;

import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.controller.ConflictException;
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
import br.com.navitasassist.repository.RmaProtocolExecutionRepository;
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
    private static final String AUDIT_TYPE = "PROTOCOL_TEMPLATE";

    private final ProtocolTemplateRepository protocolTemplateRepository;
    private final ProtocolTemplateVersionRepository protocolTemplateVersionRepository;
    private final ProductService productService;
    private final RmaProtocolExecutionRepository executionRepository;
    private final AuditService audit;

    @Transactional(readOnly = true)
    public List<ProtocolTemplateResponse> listAll() {
        Set<Long> used = executionRepository.findUsedTemplateIds();
        return protocolTemplateRepository.findAllOrderByName().stream()
            .map(template -> ProtocolTemplateResponse.from(template, used.contains(template.getId()))).toList();
    }

    public ProtocolTemplateResponse create(ProtocolTemplateRequest request) {
        ProtocolTemplate template = new ProtocolTemplate();
        applyMetadata(template, request);
        template.addVersion(buildVersion(request, 1));
        ProtocolTemplate saved = protocolTemplateRepository.save(template);
        audit.record("CREATE", AUDIT_TYPE, saved.getId(), saved.getName(), "Registro criado.");
        return ProtocolTemplateResponse.from(saved, false);
    }

    /**
     * Editing never touches existing versions: a new version is appended and only new executions use it.
     */
    public ProtocolTemplateResponse update(Long id, ProtocolTemplateRequest request) {
        ProtocolTemplate template = protocolTemplateRepository.findByIdForUpdate(id).orElseThrow(() -> new ResourceNotFoundException("Modelo de protocolo não encontrado: " + id));
        applyMetadata(template, request);
        ProtocolTemplateVersion version = buildVersion(request, template.getCurrentVersion() + 1);
        template.addVersion(version);
        protocolTemplateVersionRepository.save(version);
        ProtocolTemplate saved = protocolTemplateRepository.save(template);
        audit.record("UPDATE", AUDIT_TYPE, saved.getId(), saved.getName(), "Nova versão " + version.getVersionNumber() + " criada.");
        return ProtocolTemplateResponse.from(saved, executionRepository.existsByTemplateVersion_Template_Id(id));
    }

    /**
     * Exclusão física, permitida só para modelos que nunca foram escolhidos em uma OS (em nenhuma versão).
     * Os modelos já usados ficam preservados para o histórico: a saída é desativá-los.
     */
    public void delete(Long id) {
        ProtocolTemplate template = protocolTemplateRepository.findByIdForUpdate(id).orElseThrow(() -> new ResourceNotFoundException("Modelo de protocolo não encontrado: " + id));
        if (executionRepository.existsByTemplateVersion_Template_Id(id)) {
            throw new ConflictException("Este protocolo já foi usado em uma OS e não pode ser excluído. Desative-o.");
        }
        protocolTemplateRepository.delete(template);
        audit.record("DELETE", AUDIT_TYPE, id, template.getName(), "Registro excluído.");
    }

    @Transactional(readOnly = true)
    public ProtocolTemplate getEntityById(Long id) {
        return protocolTemplateRepository.findById(id).orElseThrow(() -> new ResourceNotFoundException("Modelo de protocolo não encontrado: " + id));
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
            throw new BusinessException("Informe um produto ou uma categoria para o protocolo.");
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
            throw new BusinessException("Itens de medição exigem unidade e número de casas decimais: " + item.getTitle());
        }
        validateLimit(request.minValue(), request.decimalPlaces(), item.getTitle());
        validateLimit(request.maxValue(), request.decimalPlaces(), item.getTitle());
        if (request.minValue() != null && request.maxValue() != null && request.minValue().compareTo(request.maxValue()) > 0) {
            throw new BusinessException("O valor mínimo não pode ser maior que o máximo: " + item.getTitle());
        }
        item.setUnit(unit);
        item.setDecimalPlaces(request.decimalPlaces());
        item.setMinValue(request.minValue());
        item.setMaxValue(request.maxValue());
        return item;
    }

    private void validateLimit(BigDecimal value, int decimalPlaces, String title) {
        if (value != null && Math.max(value.stripTrailingZeros().scale(), 0) > decimalPlaces) {
            throw new BusinessException("Os limites devem ter no máximo " + decimalPlaces + " casas decimais: " + title);
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
