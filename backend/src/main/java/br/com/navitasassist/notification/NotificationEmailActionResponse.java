package br.com.navitasassist.notification;

public record NotificationEmailActionResponse(Long notificationId, NotificationEmailStatus status, String provider) {}
