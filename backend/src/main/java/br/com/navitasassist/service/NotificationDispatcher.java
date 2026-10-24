package br.com.navitasassist.service;

import java.time.Instant;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import br.com.navitasassist.controller.ResourceNotFoundException;
import br.com.navitasassist.notification.Notification;
import br.com.navitasassist.notification.NotificationEmailStatus;
import br.com.navitasassist.notification.NotificationEvent;
import br.com.navitasassist.notification.NotificationEventStatus;
import br.com.navitasassist.notification.NotificationRule;
import br.com.navitasassist.notification.RmaNotificationEvent;
import br.com.navitasassist.repository.NotificationEventRepository;
import br.com.navitasassist.repository.NotificationMuteRepository;
import br.com.navitasassist.repository.NotificationRepository;
import br.com.navitasassist.repository.NotificationRuleRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.user.UserAccount;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Turns a claimed event into in-app notifications according to its rule. Runs in its own transaction after the RMA
 * operation has committed, so nothing here can undo the RMA change.
 */
@Service
@RequiredArgsConstructor
public class NotificationDispatcher {

    private final NotificationEventRepository notificationEventRepository;
    private final NotificationRuleRepository notificationRuleRepository;
    private final NotificationRepository notificationRepository;
    private final NotificationMuteRepository notificationMuteRepository;
    private final RmaRecordRepository rmaRecordRepository;
    private final UserAccountRepository userAccountRepository;
    private final NotificationVisibilityPolicy visibilityPolicy;
    private final NotificationContentFactory contentFactory;
    private final NotificationEmailService emailService;

    /**
     * Returns the ids of notifications that should also go out by e-mail.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public List<Long> dispatch(Long eventId, RmaNotificationEvent event) {
        NotificationEvent record = notificationEventRepository.findById(eventId).orElseThrow();
        Optional<NotificationRule> rule = notificationRuleRepository.findByEventType(event.type()).filter(candidate -> candidate.isEnabled() && event.type().isSupported());
        if (rule.isEmpty()) {
            finish(record, NotificationEventStatus.SKIPPED, 0);
            return List.of();
        }

        RmaRecord rma = rmaRecordRepository.findById(event.rmaId()).orElseThrow(() -> new ResourceNotFoundException("RMA not found: " + event.rmaId()));
        record.setRma(rma);
        NotificationContentFactory.Content content = contentFactory.build(event, rma);
        boolean sendEmail = rule.get().isEmailEnabled() && emailService.isAvailable();

        List<Notification> notifications = recipients(rule.get(), rma).stream().map(recipient -> {
            Notification notification = new Notification();
            notification.setEvent(record);
            notification.setRecipient(recipient);
            notification.setRma(rma);
            notification.setEventType(event.type());
            notification.setSeverity(rule.get().getSeverity());
            notification.setTitle(content.title());
            notification.setMessage(content.message());
            notification.setActionPath(content.actionPath());
            notification.setCreatedAt(Instant.now());
            notification.setEmailStatus(NotificationEmailStatus.NOT_REQUESTED);
            return notification;
        }).toList();

        List<Notification> saved = notificationRepository.saveAll(notifications);
        finish(record, NotificationEventStatus.PROCESSED, saved.size());
        return sendEmail ? saved.stream().map(Notification::getId).toList() : List.of();
    }

    private List<UserAccount> recipients(NotificationRule rule, RmaRecord rma) {
        Map<Long, UserAccount> recipients = new LinkedHashMap<>();
        if (!rule.getRecipientRoles().isEmpty()) {
            userAccountRepository.findAllByActiveTrueAndRoleInOrderByFullNameAsc(rule.getRecipientRoles()).forEach(user -> recipients.put(user.getId(), user));
        }
        if (rule.isNotifyAssignee() && rma.getAssignee() != null) {
            recipients.putIfAbsent(rma.getAssignee().getId(), rma.getAssignee());
        }

        Set<Long> muted = rule.isUserMutable() ? new HashSet<>(notificationMuteRepository.findUserIdsByEventType(rule.getEventType())) : Set.of();
        return recipients.values().stream().filter(user -> visibilityPolicy.canReceive(user, rule.getEventType()) && !muted.contains(user.getId())).toList();
    }

    private void finish(NotificationEvent record, NotificationEventStatus status, int recipientCount) {
        record.setStatus(status);
        record.setRecipientCount(recipientCount);
        record.setProcessedAt(Instant.now());
    }
}
