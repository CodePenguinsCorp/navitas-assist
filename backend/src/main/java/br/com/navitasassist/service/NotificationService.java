package br.com.navitasassist.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.controller.ResourceNotFoundException;
import br.com.navitasassist.notification.Notification;
import br.com.navitasassist.notification.NotificationEventType;
import br.com.navitasassist.notification.NotificationMute;
import br.com.navitasassist.notification.NotificationPreferenceResponse;
import br.com.navitasassist.notification.NotificationResponse;
import br.com.navitasassist.notification.NotificationRule;
import br.com.navitasassist.notification.NotificationSummaryResponse;
import br.com.navitasassist.notification.NotificationReadAllResponse;
import br.com.navitasassist.notification.NotificationReadUndoResponse;
import br.com.navitasassist.repository.NotificationMuteRepository;
import br.com.navitasassist.repository.NotificationRepository;
import br.com.navitasassist.repository.NotificationRuleRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.user.UserAccount;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Notification center of the authenticated user. Every query is scoped to that user on the server side.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class NotificationService {

    private static final int PAGE_SIZE = 100;

    private final NotificationRepository notificationRepository;
    private final NotificationRuleRepository notificationRuleRepository;
    private final NotificationMuteRepository notificationMuteRepository;
    private final UserAccountRepository userAccountRepository;
    private final NotificationVisibilityPolicy visibilityPolicy;
    private final Clock clock;

    @Transactional(readOnly = true)
    public List<NotificationResponse> list(boolean unreadOnly, boolean includeSnoozed) {
        UserAccount user = currentUser();
        return notificationRepository.findForRecipient(user.getId(), unreadOnly, includeSnoozed, Instant.now(), PageRequest.of(0, PAGE_SIZE)).stream()
            .filter(notification -> visibilityPolicy.canView(user, notification.getEventType()))
            .map(NotificationResponse::from)
            .toList();
    }

    @Transactional(readOnly = true)
    public NotificationSummaryResponse summary() {
        UserAccount user = currentUser();
        long unread = notificationRepository.countUnreadByType(user.getId(), Instant.now()).stream()
            .filter(row -> visibilityPolicy.canView(user, (NotificationEventType) row[0]))
            .mapToLong(row -> (Long) row[1])
            .sum();
        return new NotificationSummaryResponse(unread);
    }

    public NotificationResponse markRead(Long id) {
        Notification notification = getOwned(id, currentUserForUpdate());
        if (notification.getReadAt() == null) {
            notification.setReadAt(Instant.now());
        }
        // An explicit read after the bulk action must survive a subsequent undo.
        notification.setReadBatchToken(null);
        notification.setReadBatchExpiresAt(null);
        return NotificationResponse.from(notification);
    }

    public NotificationReadAllResponse markAllRead() {
        Long recipientId = currentUserForUpdate().getId();
        notificationRepository.dismissReadBatch(recipientId, null);
        Instant now = clock.instant();
        Instant expiresAt = now.plusSeconds(4);
        UUID token = UUID.randomUUID();
        int marked = notificationRepository.markAllRead(recipientId, now, token.toString(), expiresAt);
        return new NotificationReadAllResponse(marked, marked == 0 ? null : token, marked == 0 ? null : expiresAt);
    }

    public NotificationReadUndoResponse undoReadAll(UUID token) {
        Long recipientId = currentUserForUpdate().getId();
        int restored = notificationRepository.undoReadBatch(recipientId, token.toString(), clock.instant());
        if (restored == 0) {
            throw new BusinessException("O prazo para desfazer esta leitura terminou ou o lote não está mais disponível.");
        }
        return new NotificationReadUndoResponse(restored);
    }

    public void dismissReadAll(UUID token) {
        notificationRepository.dismissReadBatch(currentUserForUpdate().getId(), token.toString());
    }

    public NotificationResponse snooze(Long id, int minutes) {
        Notification notification = getOwned(id, currentUserForUpdate());
        notification.setSnoozedUntil(Instant.now().plus(Duration.ofMinutes(minutes)));
        return NotificationResponse.from(notification);
    }

    @Transactional(readOnly = true)
    public List<NotificationPreferenceResponse> preferences() {
        UserAccount user = currentUser();
        Set<NotificationEventType> muted = new HashSet<>(notificationMuteRepository.findEventTypesByUserId(user.getId()));
        return notificationRuleRepository.findAllByOrderByIdAsc().stream()
            .filter(rule -> visibilityPolicy.canView(user, rule.getEventType()))
            .map(rule -> toPreference(rule, muted.contains(rule.getEventType())))
            .toList();
    }

    public NotificationPreferenceResponse updatePreference(NotificationEventType eventType, boolean muted) {
        UserAccount user = currentUser();
        NotificationRule rule = notificationRuleRepository.findByEventType(eventType).filter(candidate -> visibilityPolicy.canView(user, candidate.getEventType()))
            .orElseThrow(() -> new ResourceNotFoundException("Notification rule not found: " + eventType));
        if (muted && !rule.isUserMutable()) {
            throw new BusinessException("This notification rule cannot be muted: " + eventType);
        }

        var existing = notificationMuteRepository.findByUser_IdAndEventType(user.getId(), eventType);
        if (muted && existing.isEmpty()) {
            NotificationMute mute = new NotificationMute();
            mute.setUser(user);
            mute.setEventType(eventType);
            mute.setCreatedAt(Instant.now());
            notificationMuteRepository.save(mute);
        } else if (!muted) {
            existing.ifPresent(notificationMuteRepository::delete);
        }
        return toPreference(rule, muted);
    }

    private NotificationPreferenceResponse toPreference(NotificationRule rule, boolean muted) {
        return new NotificationPreferenceResponse(rule.getEventType(), rule.getSeverity(), rule.isEnabled(), rule.isUserMutable(), muted);
    }

    private Notification getOwned(Long id, UserAccount user) {
        return notificationRepository.findByIdAndRecipient_Id(id, user.getId())
            .filter(notification -> visibilityPolicy.canView(user, notification.getEventType()))
            .orElseThrow(() -> new ResourceNotFoundException("Notification not found: " + id));
    }

    private UserAccount currentUser() {
        return userAccountRepository.findByUsernameIgnoreCase(currentUsername())
            .orElseThrow(() -> new ResourceNotFoundException("Authenticated user not found"));
    }

    /** Serialize read changes across tabs/instances using the existing recipient row, not a process-local lock. */
    private UserAccount currentUserForUpdate() {
        return userAccountRepository.findByUsernameIgnoreCaseForUpdate(currentUsername())
            .orElseThrow(() -> new ResourceNotFoundException("Authenticated user not found"));
    }

    private String currentUsername() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        String username = authentication == null ? null : authentication.getName();
        return username == null ? "" : username;
    }
}
