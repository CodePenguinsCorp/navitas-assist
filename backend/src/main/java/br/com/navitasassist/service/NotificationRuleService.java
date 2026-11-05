package br.com.navitasassist.service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;

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
import br.com.navitasassist.user.UserRole;
import lombok.RequiredArgsConstructor;
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

    private static final int FAILURE_LIMIT = 50;

    private final NotificationRuleRepository notificationRuleRepository;
    private final NotificationEventRepository notificationEventRepository;
    private final NotificationRepository notificationRepository;

    @Transactional(readOnly = true)
    public List<NotificationRuleResponse> list() {
        return notificationRuleRepository.findAllByOrderByIdAsc().stream().map(NotificationRuleResponse::from).toList();
    }

    public NotificationRuleResponse update(NotificationEventType eventType, NotificationRuleRequest request) {
        NotificationRule rule = notificationRuleRepository.findByEventType(eventType).orElseThrow(() -> new ResourceNotFoundException("Notification rule not found: " + eventType));
        rule.setEnabled(request.enabled());
        rule.setSeverity(request.severity());
        rule.setRecipientRoles(request.recipientRoles().isEmpty() ? EnumSet.noneOf(UserRole.class) : EnumSet.copyOf(request.recipientRoles()));
        rule.setNotifyAssignee(request.notifyAssignee());
        rule.setEmailEnabled(request.emailEnabled());
        rule.setUserMutable(request.userMutable());
        return NotificationRuleResponse.from(notificationRuleRepository.saveAndFlush(rule));
    }

    @Transactional(readOnly = true)
    public List<NotificationFailureResponse> failures() {
        List<NotificationFailureResponse> failures = new ArrayList<>();
        notificationEventRepository.findByStatusOrderByOccurredAtDesc(NotificationEventStatus.FAILED, PageRequest.of(0, FAILURE_LIMIT)).forEach(event -> failures.add(new NotificationFailureResponse(
            "EVENT", event.getEventKey(), event.getEventType(), event.getRma() == null ? null : event.getRma().getCode(), null, event.getErrorMessage(), event.getOccurredAt())));
        notificationRepository.findByEmailStatusOrderByCreatedAtDesc(NotificationEmailStatus.FAILED, PageRequest.of(0, FAILURE_LIMIT)).forEach(notification -> failures.add(new NotificationFailureResponse(
            "EMAIL", notification.getEvent().getEventKey(), notification.getEventType(), notification.getRma() == null ? null : notification.getRma().getCode(),
            notification.getRecipient().getUsername(), notification.getEmailError(), notification.getCreatedAt())));
        failures.sort(Comparator.comparing(NotificationFailureResponse::occurredAt).reversed());
        return failures;
    }
}
