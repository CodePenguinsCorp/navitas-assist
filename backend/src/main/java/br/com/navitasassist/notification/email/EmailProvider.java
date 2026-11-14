package br.com.navitasassist.notification.email;

public interface EmailProvider {
    EmailSendResult send(EmailMessage message, String idempotencyKey);
}
