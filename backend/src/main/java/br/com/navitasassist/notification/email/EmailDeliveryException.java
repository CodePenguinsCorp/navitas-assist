package br.com.navitasassist.notification.email;

/** Only fixed, safe codes cross the provider boundary. Never attach an HTTP response or exception cause. */
public class EmailDeliveryException extends RuntimeException {
    private final boolean retryable;
    public EmailDeliveryException(String code, boolean retryable) {
        super(code);
        this.retryable = retryable;
    }
    public String code() { return getMessage(); }
    public boolean retryable() { return retryable; }
}
