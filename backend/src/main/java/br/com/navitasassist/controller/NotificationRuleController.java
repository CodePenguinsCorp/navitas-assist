package br.com.navitasassist.controller;

import java.util.List;

import br.com.navitasassist.notification.NotificationEventType;
import br.com.navitasassist.notification.NotificationFailureResponse;
import br.com.navitasassist.notification.NotificationRuleRequest;
import br.com.navitasassist.notification.NotificationRuleResponse;
import br.com.navitasassist.service.NotificationRuleService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/notification-rules")
@RequiredArgsConstructor
public class NotificationRuleController {

    private final NotificationRuleService notificationRuleService;

    @GetMapping
    public List<NotificationRuleResponse> list() {
        return notificationRuleService.list();
    }

    @PutMapping("/{eventType}")
    public NotificationRuleResponse update(@PathVariable NotificationEventType eventType, @Valid @RequestBody NotificationRuleRequest request) {
        return notificationRuleService.update(eventType, request);
    }

    @GetMapping("/failures")
    public List<NotificationFailureResponse> failures() {
        return notificationRuleService.failures();
    }
}
