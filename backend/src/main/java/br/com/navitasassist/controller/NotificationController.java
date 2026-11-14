package br.com.navitasassist.controller;

import java.util.List;

import br.com.navitasassist.notification.NotificationEventType;
import br.com.navitasassist.notification.NotificationPreferenceRequest;
import br.com.navitasassist.notification.NotificationPreferenceResponse;
import br.com.navitasassist.notification.NotificationResponse;
import br.com.navitasassist.notification.NotificationSnoozeRequest;
import br.com.navitasassist.notification.NotificationSummaryResponse;
import br.com.navitasassist.notification.NotificationReadAllResponse;
import br.com.navitasassist.notification.NotificationReadBatchRequest;
import br.com.navitasassist.notification.NotificationReadUndoResponse;
import br.com.navitasassist.service.NotificationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;

    @GetMapping
    public List<NotificationResponse> list(@RequestParam(defaultValue = "false") boolean unreadOnly, @RequestParam(defaultValue = "false") boolean includeSnoozed, @RequestParam(required = false) NotificationEventType eventType, @RequestParam(required = false) br.com.navitasassist.notification.NotificationSeverity severity) {
        return notificationService.list(unreadOnly, includeSnoozed, eventType, severity);
    }

    @GetMapping("/summary")
    public NotificationSummaryResponse summary() {
        return notificationService.summary();
    }

    @PostMapping("/{id}/read")
    public NotificationResponse markRead(@PathVariable Long id) {
        return notificationService.markRead(id);
    }

    @PostMapping("/read-all")
    public NotificationReadAllResponse markAllRead() {
        return notificationService.markAllRead();
    }

    @PostMapping("/read-all/undo")
    public NotificationReadUndoResponse undoReadAll(@Valid @RequestBody NotificationReadBatchRequest request) {
        return notificationService.undoReadAll(request.token());
    }

    @PostMapping("/read-all/dismiss")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void dismissReadAll(@Valid @RequestBody NotificationReadBatchRequest request) {
        notificationService.dismissReadAll(request.token());
    }

    @PostMapping("/{id}/snooze")
    public NotificationResponse snooze(@PathVariable Long id, @Valid @RequestBody NotificationSnoozeRequest request) {
        return notificationService.snooze(id, request.minutes());
    }

    @GetMapping("/preferences")
    public List<NotificationPreferenceResponse> preferences() {
        return notificationService.preferences();
    }

    @PutMapping("/preferences/{eventType}")
    public NotificationPreferenceResponse updatePreference(@PathVariable NotificationEventType eventType, @Valid @RequestBody NotificationPreferenceRequest request) {
        return notificationService.updatePreference(eventType, request.muted());
    }
}
