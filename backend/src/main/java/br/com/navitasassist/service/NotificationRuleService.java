package br.com.navitasassist.service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;

import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.controller.ResourceNotFoundException;
import br.com.navitasassist.notification.NotificationEmailStatus;
import br.com.navitasassist.notification.NotificationEventStatus;
import br.com.navitasassist.notification.NotificationEventType;
import br.com.navitasassist.notification.NotificationFailureResponse;
import br.com.navitasassist.notification.NotificationRule;
import br.com.navitasassist.notification.NotificationRuleRequest;
import br.com.navitasassist.notification.NotificationRuleResponse;
import br.com.navitasassist.repository.NotificationEventRepository;
import br.com.navitasassist.repository.NotificationRepository;
import br.com.navitasassist.repository.NotificationRuleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Administration of notification rules. Rules live in the database, so changes apply to the next event without a deploy.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class NotificationRuleService {
    private final AuditService audit;

    private static final int FAILURE_LIMIT = 50;

    private final NotificationRuleRepository notificationRuleRepository;
    private final NotificationEventRepository notificationEventRepository;
    private final NotificationRepository notificationRepository;
    private final AccessProfileService accessProfileService;
    private final NotificationEmailQueue emailQueue;

    @Transactional(readOnly = true)
    public List<NotificationRuleResponse> list() {
        return notificationRuleRepository.findAllByOrderByIdAsc().stream().map(NotificationRuleResponse::from).toList();
    }

    public NotificationRuleResponse update(NotificationEventType eventType, NotificationRuleRequest request) {
        NotificationRule rule = notificationRuleRepository.findByEventType(eventType).orElseThrow(() -> new ResourceNotFoundException("Notification rule not found: " + eventType));
        if (request.enabled() && !eventType.isSupported()) throw new BusinessException("Unsupported notification event.");
        rule.setEnabled(request.enabled());
        if (request.appEnabled() != null) rule.setAppEnabled(request.appEnabled());
        rule.setSeverity(request.severity());
        rule.setRecipientProfiles(new HashSet<>(request.recipientProfileIds().stream().sorted().map(accessProfileService::getEntity).toList()));
        rule.setNotifyAssignee(request.notifyAssignee());
        rule.setEmailEnabled(request.emailEnabled());
        rule.setUserMutable(request.userMutable());
        try {
            notificationRuleRepository.saveAndFlush(rule);

        } catch (DataIntegrityViolationException exception) {
            // Perfil apagado entre a validação e a gravação: a FK recusa e a resposta é 400, não 500.
            throw new BusinessException("Um dos perfis destinatários não existe mais.");
        }
        audit.record("RULE_UPDATE", "NOTIFICATION_RULE", rule.getId(), eventType.name(), "Regra de notificação alterada.");
        return NotificationRuleResponse.from(rule);
    }

    @Transactional(readOnly = true)
    public List<NotificationFailureResponse> failures() {
        List<NotificationFailureResponse> failures = new ArrayList<>();
        notificationEventRepository.findByStatusOrderByOccurredAtDesc(NotificationEventStatus.FAILED, PageRequest.of(0, FAILURE_LIMIT)).forEach(event -> failures.add(new NotificationFailureResponse(
            "EVENT", event.getEventKey(), event.getEventType(), event.getRma() == null ? null : event.getRma().getCode(), null, "EVENT_PROCESSING_ERROR", event.getOccurredAt())));
        notificationRepository.findByEmailStatusOrderByCreatedAtDesc(NotificationEmailStatus.FAILED, PageRequest.of(0, FAILURE_LIMIT)).forEach(notification -> failures.add(new NotificationFailureResponse(
            "EMAIL", notification.getEvent().getEventKey(), notification.getEventType(), notification.getRma() == null ? null : notification.getRma().getCode(),
            notification.getRecipient().getUsername(), safeError(notification.getEmailError()), notification.getCreatedAt(), notification.getId(), notification.getEmailAttempts(), notification.getEmailProvider(), notification.getEmailStatus(), notification.getEmailNextAttemptAt(), emailQueue.eligible(notification))));
        failures.sort(Comparator.comparing(NotificationFailureResponse::occurredAt).reversed());
        return failures.stream().limit(FAILURE_LIMIT).toList();
    }
    private String safeError(String code) {
        return code != null && code.matches("[A-Z][A-Z0-9_]{0,79}") ? code : "EMAIL_DELIVERY_ERROR";
    }

}
