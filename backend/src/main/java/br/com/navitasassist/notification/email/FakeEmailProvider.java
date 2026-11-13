package br.com.navitasassist.notification.email;

import java.util.ArrayDeque;
import java.util.List;

public class FakeEmailProvider implements EmailProvider {
    public record Capture(EmailMessage message, String idempotencyKey) {}
    private final ArrayDeque<Capture> messages = new ArrayDeque<>();
    @Override public synchronized EmailSendResult send(EmailMessage message, String idempotencyKey) {
        if (messages.size() == 100) messages.removeFirst();
        messages.addLast(new Capture(message, idempotencyKey));
        return new EmailSendResult("fake-" + idempotencyKey);
    }
    public synchronized List<Capture> captures() { return List.copyOf(messages); }
}
