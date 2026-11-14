package br.com.navitasassist.notification.email;

import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;

public record EmailMessage(String from, String to, String subject, String text, String html) {
    private static final Pattern ADDRESS = Pattern.compile("[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\\.[A-Za-z]{2,}");
    public static boolean validAddress(String value) {
        return value != null && value.length() <= 254 && ADDRESS.matcher(value).matches();
    }
    public EmailMessage {
        if (!validAddress(from) || !validAddress(to) || subject == null || subject.indexOf('\r') >= 0 || subject.indexOf('\n') >= 0 || subject.length() > 160) {
            throw new EmailDeliveryException("INVALID_CONTENT", false);
        }
        if (text == null || html == null) throw new EmailDeliveryException("INVALID_CONTENT", false);
        if ((text + html).getBytes(StandardCharsets.UTF_8).length > 65536) throw new EmailDeliveryException("CONTENT_TOO_LARGE", false);
    }
    @Override public String toString() { return "EmailMessage[REDACTED]"; }
}
