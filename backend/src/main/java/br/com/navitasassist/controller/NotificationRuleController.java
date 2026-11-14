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
    private final br.com.navitasassist.service.NotificationEmailAdminService emailAdmin;

    @GetMapping("/email-status")
    public br.com.navitasassist.notification.NotificationEmailStatusResponse emailStatus() {
        return emailAdmin.status();
    }

    @org.springframework.web.bind.annotation.PostMapping("/emails/{notificationId}/retry")
    @org.springframework.web.bind.annotation.ResponseStatus(org.springframework.http.HttpStatus.ACCEPTED)
    public br.com.navitasassist.notification.NotificationEmailActionResponse retryEmail(@PathVariable Long notificationId, java.security.Principal principal) {
        return emailAdmin.retry(notificationId, principal.getName());
    }

    @org.springframework.web.bind.annotation.PostMapping("/emails/test")
    public br.com.navitasassist.notification.NotificationEmailTestResponse testEmail(@RequestBody(required = false) java.util.Map<String, Object> body, java.security.Principal principal) {
        if (body != null && !body.isEmpty()) throw new br.com.navitasassist.controller.BusinessException("Email test accepts no recipient or payload.");
        return emailAdmin.test(principal.getName());
    }

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
