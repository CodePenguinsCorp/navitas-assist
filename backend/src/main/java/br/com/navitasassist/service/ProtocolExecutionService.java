package br.com.navitasassist.service;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.controller.ResourceNotFoundException;
import br.com.navitasassist.protocol.ProtocolExecutionItemResponse;
import br.com.navitasassist.protocol.ProtocolExecutionResponse;
import br.com.navitasassist.protocol.ProtocolExecutionStatus;
import br.com.navitasassist.protocol.ProtocolItemOutcome;
import br.com.navitasassist.protocol.ProtocolItemResultRequest;
import br.com.navitasassist.protocol.ProtocolItemResultResponse;
import br.com.navitasassist.protocol.ProtocolItemType;
import br.com.navitasassist.protocol.ProtocolTemplate;
import br.com.navitasassist.protocol.ProtocolTemplateItem;
import br.com.navitasassist.protocol.ProtocolTemplateItemResponse;
import br.com.navitasassist.protocol.ProtocolTemplateVersion;
import br.com.navitasassist.protocol.RmaProtocolExecution;
import br.com.navitasassist.protocol.RmaProtocolItemResult;
import br.com.navitasassist.repository.RmaProtocolExecutionRepository;
import br.com.navitasassist.repository.RmaProtocolItemResultRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.rma.RmaStatus;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Runs protocol checklists on RMAs. {@link #listForRma(Long)} is also the integration point for the technical report
 * (NAV-27): it identifies protocol, version, executor and every attempt of each item.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class ProtocolExecutionService {

    private final RmaProtocolExecutionRepository rmaProtocolExecutionRepository;
    private final RmaProtocolItemResultRepository rmaProtocolItemResultRepository;
    private final RmaRecordRepository rmaRecordRepository;
    private final ProtocolTemplateService protocolTemplateService;

    @Transactional(readOnly = true)
    public List<ProtocolExecutionResponse> listForRma(Long rmaId) {
        if (!rmaRecordRepository.existsById(rmaId)) {
            throw new ResourceNotFoundException("RMA not found: " + rmaId);
        }
        return rmaProtocolExecutionRepository.findAllByRma_IdOrderByIdAsc(rmaId).stream().map(this::toResponse).toList();
    }

    public ProtocolExecutionResponse start(Long rmaId, Long templateId) {
        RmaRecord rma = rmaRecordRepository.findByIdForUpdate(rmaId).orElseThrow(() -> new ResourceNotFoundException("RMA not found: " + rmaId));
        ProtocolTemplate template = protocolTemplateService.getEntityById(templateId);
        if (!template.isActive()) {
            throw new BusinessException("Inactive protocols cannot be started.");
        }
        if (!protocolTemplateService.appliesTo(template, rma)) {
            throw new BusinessException("This protocol does not apply to the products of the RMA.");
        }
        if (rmaProtocolExecutionRepository.existsByRma_IdAndTemplateVersion_Template_IdAndStatus(rmaId, templateId, ProtocolExecutionStatus.IN_PROGRESS)) {
            throw new BusinessException("This protocol is already in progress for the RMA.");
        }

        ProtocolTemplateVersion version = template.latestVersion();
        RmaProtocolExecution execution = new RmaProtocolExecution();
        execution.setRma(rma);
        execution.setTemplateVersion(version);
        execution.setTemplateName(template.getName());
        execution.setVersionNumber(version.getVersionNumber());
        execution.setStartedBy(currentUsername());
        execution.setStartedAt(Instant.now());
        return toResponse(rmaProtocolExecutionRepository.save(execution));
    }

    public ProtocolExecutionResponse recordResult(Long executionId, Long itemId, ProtocolItemResultRequest request) {
        RmaProtocolExecution execution = rmaProtocolExecutionRepository.findByIdForUpdate(executionId)
            .orElseThrow(() -> new ResourceNotFoundException("Protocol execution not found: " + executionId));
        if (execution.getStatus() != ProtocolExecutionStatus.IN_PROGRESS) {
            throw new BusinessException("Finished protocol executions cannot receive new results. Start a new execution.");
        }
        ProtocolTemplateItem item = execution.getTemplateVersion().getItems().stream().filter(candidate -> candidate.getId().equals(itemId)).findFirst()
            .orElseThrow(() -> new ResourceNotFoundException("Protocol item not found in this execution: " + itemId));

        int previousAttempts = (int) execution.getResults().stream().filter(result -> result.getItem().getId().equals(itemId)).count();
        String justification = trimToNull(request.justification());
        if (previousAttempts > 0 && justification == null) {
            throw new BusinessException("Repeating an item requires a justification.");
        }
        if (request.outcome() != ProtocolItemOutcome.PASSED && justification == null) {
            throw new BusinessException("Failed or not applicable items require a justification.");
        }

        RmaProtocolItemResult result = new RmaProtocolItemResult();
        result.setExecution(execution);
        result.setItem(item);
        result.setAttempt(previousAttempts + 1);
        result.setOutcome(request.outcome());
        result.setJustification(justification);
        result.setEvidence(trimToNull(request.evidence()));
        applyValue(item, request, result);

        Instant now = Instant.now();
        Instant startedAt = request.startedAt() == null ? now : request.startedAt();
        if (startedAt.isAfter(now.plus(Duration.ofMinutes(5))) || startedAt.isBefore(execution.getStartedAt().minus(Duration.ofMinutes(5)))) {
            throw new BusinessException("Item start must be between the protocol start and now.");
        }
        result.setStartedAt(startedAt);
        result.setCompletedAt(now);
        result.setExecutedBy(currentUsername());

        execution.getResults().add(rmaProtocolItemResultRepository.save(result));
        return toResponse(execution);
    }

    public ProtocolExecutionResponse complete(Long executionId) {
        RmaProtocolExecution execution = rmaProtocolExecutionRepository.findByIdForUpdate(executionId)
            .orElseThrow(() -> new ResourceNotFoundException("Protocol execution not found: " + executionId));
        if (execution.getStatus() != ProtocolExecutionStatus.IN_PROGRESS) {
            throw new BusinessException("Protocol execution is already finished.");
        }

        Map<Long, RmaProtocolItemResult> latest = latestResults(execution);
        List<String> missing = execution.getTemplateVersion().getItems().stream()
            .filter(item -> item.isRequired() && !latest.containsKey(item.getId()))
            .map(ProtocolTemplateItem::getTitle)
            .toList();
        if (!missing.isEmpty()) {
            throw new BusinessException("Required items are pending: " + String.join(", ", missing));
        }

        boolean failed = latest.values().stream().anyMatch(result -> result.getOutcome() == ProtocolItemOutcome.FAILED);
        execution.setStatus(failed ? ProtocolExecutionStatus.FAILED : ProtocolExecutionStatus.COMPLETED);
        execution.setCompletedBy(currentUsername());
        execution.setCompletedAt(Instant.now());
        return toResponse(rmaProtocolExecutionRepository.save(execution));
    }

    /**
     * Blocks RMA status changes configured in the protocol version while its latest execution has unsatisfied required items.
     */
    @Transactional(readOnly = true)
    public void assertTransitionAllowed(RmaRecord rma, RmaStatus targetStatus) {
        if (rma.getId() == null) {
            return;
        }
        Map<Long, RmaProtocolExecution> latestByTemplate = rmaProtocolExecutionRepository.findAllByRma_IdOrderByIdAsc(rma.getId()).stream()
            .collect(Collectors.toMap(execution -> execution.getTemplateVersion().getTemplate().getId(), Function.identity(), (first, second) -> second));

        latestByTemplate.values().stream()
            .filter(execution -> execution.getTemplateVersion().blockedStatusSet().contains(targetStatus))
            .filter(execution -> pendingRequired(execution) > 0)
            .findFirst()
            .ifPresent(execution -> {
                throw new BusinessException("Required items of protocol " + execution.getTemplateName() + " v" + execution.getVersionNumber()
                    + " are pending. The RMA cannot move to " + targetStatus + ".");
            });
    }

    private void applyValue(ProtocolTemplateItem item, ProtocolItemResultRequest request, RmaProtocolItemResult result) {
        boolean applicable = request.outcome() != ProtocolItemOutcome.NOT_APPLICABLE;
        if (item.getType() == ProtocolItemType.MEASUREMENT && (applicable || request.measuredValue() != null)) {
            BigDecimal value = request.measuredValue();
            if (value == null) {
                throw new BusinessException("Measurement value is required: " + item.getTitle());
            }
            if (Math.max(value.stripTrailingZeros().scale(), 0) > item.getDecimalPlaces()) {
                throw new BusinessException("Measurement must use at most " + item.getDecimalPlaces() + " decimal places: " + item.getTitle());
            }
            boolean outOfRange = (item.getMinValue() != null && value.compareTo(item.getMinValue()) < 0) || (item.getMaxValue() != null && value.compareTo(item.getMaxValue()) > 0);
            if (outOfRange && request.outcome() == ProtocolItemOutcome.PASSED) {
                throw new BusinessException("Measurement outside the expected range cannot pass: " + item.getTitle());
            }
            result.setMeasuredValue(value);
            result.setUnit(item.getUnit());
        }
        if (item.getType() == ProtocolItemType.TEXT) {
            String text = trimToNull(request.textValue());
            if (applicable && text == null) {
                throw new BusinessException("Text result is required: " + item.getTitle());
            }
            result.setTextValue(text);
        }
        if (item.isEvidenceRequired() && request.outcome() == ProtocolItemOutcome.PASSED && result.getEvidence() == null) {
            throw new BusinessException("Evidence is required: " + item.getTitle());
        }
    }

    private ProtocolExecutionResponse toResponse(RmaProtocolExecution execution) {
        Map<Long, RmaProtocolItemResult> latest = latestResults(execution);
        List<ProtocolTemplateItem> items = execution.getTemplateVersion().getItems();
        List<ProtocolExecutionItemResponse> itemResponses = items.stream().map(item -> new ProtocolExecutionItemResponse(
            ProtocolTemplateItemResponse.from(item),
            Optional.ofNullable(latest.get(item.getId())).map(ProtocolItemResultResponse::from).orElse(null),
            execution.getResults().stream()
                .filter(result -> result.getItem().getId().equals(item.getId()))
                .sorted(Comparator.comparingInt(RmaProtocolItemResult::getAttempt))
                .map(ProtocolItemResultResponse::from)
                .toList()
        )).toList();

        int failed = (int) latest.values().stream().filter(result -> result.getOutcome() == ProtocolItemOutcome.FAILED).count();
        return new ProtocolExecutionResponse(
            execution.getId(),
            execution.getRma().getId(),
            execution.getRma().getCode(),
            execution.getTemplateVersion().getTemplate().getId(),
            execution.getTemplateName(),
            execution.getVersionNumber(),
            execution.getStatus(),
            execution.getTemplateVersion().blockedStatusSet(),
            execution.getStartedBy(),
            execution.getStartedAt(),
            execution.getCompletedBy(),
            execution.getCompletedAt(),
            items.size(),
            latest.size(),
            (int) items.stream().filter(ProtocolTemplateItem::isRequired).count(),
            pendingRequired(execution),
            failed,
            itemResponses
        );
    }

    private int pendingRequired(RmaProtocolExecution execution) {
        Map<Long, RmaProtocolItemResult> latest = latestResults(execution);
        return (int) execution.getTemplateVersion().getItems().stream()
            .filter(ProtocolTemplateItem::isRequired)
            .filter(item -> latest.get(item.getId()) == null || !latest.get(item.getId()).getOutcome().satisfiesRequirement())
            .count();
    }

    private Map<Long, RmaProtocolItemResult> latestResults(RmaProtocolExecution execution) {
        return execution.getResults().stream().collect(Collectors.toMap(
            result -> result.getItem().getId(),
            Function.identity(),
            (first, second) -> first.getAttempt() >= second.getAttempt() ? first : second
        ));
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
