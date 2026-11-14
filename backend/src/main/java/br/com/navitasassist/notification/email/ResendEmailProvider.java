package br.com.navitasassist.notification.email;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.*;

public class ResendEmailProvider implements EmailProvider {
    private final String apiKey;
    private final ObjectMapper mapper;
    private final URI endpoint;
    private final Duration timeout;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build();

    public ResendEmailProvider(String apiKey, ObjectMapper mapper) {
        this(apiKey, mapper, URI.create("https://api.resend.com/emails"), Duration.ofSeconds(10));
    }
    /** Endpoint injection is for local HTTP tests; no configurable production endpoint. */
    public ResendEmailProvider(String apiKey, ObjectMapper mapper, URI endpoint, Duration timeout) {
        this.apiKey = apiKey;
        this.mapper = mapper;
        this.endpoint = endpoint;
        this.timeout = timeout;
    }
    @Override public EmailSendResult send(EmailMessage message, String idempotencyKey) {
        CompletableFuture<HttpResponse<byte[]>> pending = null;
        try {
            byte[] json = mapper.writeValueAsBytes(Map.of("from", message.from(), "to", List.of(message.to()), "subject", message.subject(), "text", message.text(), "html", message.html()));
            HttpRequest request = HttpRequest.newBuilder(endpoint).timeout(timeout).header("Authorization", "Bearer " + apiKey)
                .header("Content-Type", "application/json").header("Idempotency-Key", idempotencyKey).POST(HttpRequest.BodyPublishers.ofByteArray(json)).build();
            pending = client.sendAsync(request, info -> new LimitedBodySubscriber(info.statusCode() < 200 || info.statusCode() >= 300));
            HttpResponse<byte[]> response = pending.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
            int status = response.statusCode();
            if (status < 200 || status >= 300) throw new EmailDeliveryException("HTTP_" + status, status == 429 || status >= 500);
            var id = mapper.readTree(response.body()).path("id");
            if (!id.isTextual() || !id.asText().matches("[A-Za-z0-9_-]{1,200}")) throw new EmailDeliveryException("INVALID_RESPONSE", true);
            return new EmailSendResult(id.asText());
        } catch (EmailDeliveryException e) {
            throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new EmailDeliveryException("NETWORK_ERROR", true);
        } catch (IOException | ExecutionException | TimeoutException e) {
            throw new EmailDeliveryException("NETWORK_ERROR", true);
        } finally {
            if (pending != null && !pending.isDone()) pending.cancel(true);
        }
    }

    private static class LimitedBodySubscriber implements HttpResponse.BodySubscriber<byte[]> {
        private final CompletableFuture<byte[]> result = new CompletableFuture<>();
        private final java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
        private Flow.Subscription subscription;
        private final boolean discard;
        LimitedBodySubscriber(boolean discard) { this.discard = discard; }
        public CompletionStage<byte[]> getBody() { return result; }
        public void onSubscribe(Flow.Subscription value) {
            subscription = value;
            if (discard) { value.cancel(); result.complete(new byte[0]); }
            else value.request(1);
        }
        public void onNext(List<java.nio.ByteBuffer> buffers) {
            for (var buffer : buffers) {
                if (bytes.size() + buffer.remaining() > 16384) {
                    subscription.cancel();
                    result.completeExceptionally(new IOException("RESPONSE_TOO_LARGE"));
                    return;
                }
                byte[] chunk = new byte[buffer.remaining()];
                buffer.get(chunk);
                bytes.writeBytes(chunk);
            }
            subscription.request(1);
        }
        public void onError(Throwable error) { result.completeExceptionally(new IOException("NETWORK_ERROR")); }
        public void onComplete() { result.complete(bytes.toByteArray()); }
    }
}
