package br.com.navitasassist.controller;

import java.util.List;

import br.com.navitasassist.notification.NotificationEventType;
import br.com.navitasassist.notification.NotificationPreferenceRequest;
import br.com.navitasassist.notification.NotificationPreferenceResponse;
import br.com.navitasassist.notification.NotificationResponse;
import br.com.navitasassist.notification.NotificationSnoozeRequest;
import br.com.navitasassist.notification.NotificationSummaryResponse;
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
    public List<NotificationResponse> list(@RequestParam(defaultValue = "false") boolean unreadOnly, @RequestParam(defaultValue = "false") boolean includeSnoozed) {
        return notificationService.list(unreadOnly, includeSnoozed);
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
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void markAllRead() {
        notificationService.markAllRead();
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
