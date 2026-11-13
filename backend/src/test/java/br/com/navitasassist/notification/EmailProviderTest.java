package br.com.navitasassist.notification;

import static org.junit.jupiter.api.Assertions.*;
import br.com.navitasassist.notification.email.*;
import br.com.navitasassist.config.NotificationProperties;
import java.net.*;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

class EmailProviderTest {
    private final EmailMessage message = new EmailMessage("from@example.invalid", "to@example.invalid", "Assunto", "Texto", "<p>Texto</p>");

    @Test void fakeKeepsOnlyLast100Messages() {
        FakeEmailProvider fake = new FakeEmailProvider();
        for (int i = 0; i < 105; i++) fake.send(message, "" + i);
        assertEquals(100, fake.captures().size());
        assertEquals("5", fake.captures().get(0).idempotencyKey());
    }

    @Test void configIsDisabledAndFakeByDefaultAndRequiresExplicitSettingsWhenEnabled() {
        NotificationProperties.Email config = new NotificationProperties.Email();
        config.validate(true);
        assertFalse(config.isEnabled());
        assertEquals("fake", config.getProvider());
        config.setEnabled(true);
        assertThrows(IllegalStateException.class, () -> config.validate(true));
        config.setFrom("from@example.invalid");
        config.setAppBaseUrl("http://localhost:4200");
        config.validate(true);
        config.setProvider("resend");
        assertThrows(IllegalStateException.class, () -> config.validate(true));
        config.setApiKey("synthetic-key");
        config.setAppBaseUrl("https://app.example.invalid");
        config.validate(true);
        config.setProvider("unknown");
        assertThrows(IllegalStateException.class, () -> config.validate(true));
    }

    @Test void enabledFakeProviderIsRefusedOutsideLocalAndTestProfiles() {
        NotificationProperties.Email config = new NotificationProperties.Email();
        config.validate(false);
        config.setEnabled(true);
        config.setFrom("from@example.invalid");
        config.setAppBaseUrl("https://app.example.invalid");
        config.validate(true);
        IllegalStateException error = assertThrows(IllegalStateException.class, () -> config.validate(false));
        assertEquals("O provedor de e-mail falso só é permitido nos perfis local e test; ajuste NOTIFICATIONS_EMAIL_PROVIDER.", error.getMessage());
        config.setProvider("resend");
        config.setApiKey("synthetic-key");
        config.validate(false);
    }

    @Test void startupFailsWhenFakeEmailIsEnabledWithoutLocalOrTestProfile() {
        var environment = new org.springframework.mock.env.MockEnvironment();
        environment.setActiveProfiles("prod");
        NotificationProperties properties = new NotificationProperties();
        properties.getEmail().setEnabled(true);
        properties.getEmail().setFrom("from@example.invalid");
        properties.getEmail().setAppBaseUrl("https://app.example.invalid");
        var config = new br.com.navitasassist.config.NotificationEmailConfig();
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        assertThrows(IllegalStateException.class, () -> config.emailProvider(properties, mapper, environment));
        environment.setActiveProfiles("local");
        config.emailProvider(properties, mapper, environment);
    }

    @Test void resendUsesPostBearerSingleRecipientAndStableKey() throws Exception {
        AtomicReference<String> body = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/emails", exchange -> {
            assertEquals("POST", exchange.getRequestMethod());
            assertEquals("Bearer synthetic-key", exchange.getRequestHeaders().getFirst("Authorization"));
            assertEquals("42", exchange.getRequestHeaders().getFirst("Idempotency-Key"));
            body.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] response = "{\"id\":\"accepted-42\"}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();
        try {
            var provider = new ResendEmailProvider("synthetic-key", new ObjectMapper(), URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/emails"), Duration.ofSeconds(1));
            assertEquals("accepted-42", provider.send(message, "42").providerMessageId());
            var json = new ObjectMapper().readTree(body.get());
            assertEquals(1, json.get("to").size());
            assertEquals(message.to(), json.get("to").get(0).asText());
            assertEquals(message.html(), json.get("html").asText());
            assertEquals(message.text(), json.get("text").asText());
        } finally { server.stop(0); }
    }

    @Test void classifiesHttpFailuresAndRejectsMalformedLargeOrRedirectResponses() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        AtomicReference<Integer> status = new AtomicReference<>(400);
        AtomicReference<String> response = new AtomicReference<>("secret synthetic response to@example.invalid");
        server.createContext("/emails", exchange -> {
            byte[] bytes = response.get().getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Location", "/never-follow");
            exchange.sendResponseHeaders(status.get(), bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
        try {
            var provider = new ResendEmailProvider("synthetic-key", new ObjectMapper(), URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/emails"), Duration.ofSeconds(1));
            for (int code : new int[]{400,401,403,429,500,503,302}) {
                status.set(code);
                var failure = assertThrows(EmailDeliveryException.class, () -> provider.send(message, "42"));
                assertEquals(code == 429 || code >= 500, failure.retryable());
                assertEquals("HTTP_" + code, failure.code());
                assertFalse(failure.toString().contains("synthetic"));
            }
            status.set(400); response.set("x".repeat(17000));
            var largeError = assertThrows(EmailDeliveryException.class, () -> provider.send(message, "42"));
            assertFalse(largeError.retryable());
            assertEquals("HTTP_400", largeError.code());
            status.set(200);
            for (String body : new String[]{"not-json", "{}", "{\"id\":null}", "x".repeat(17000)}) {
                response.set(body);
                assertTrue(assertThrows(EmailDeliveryException.class, () -> provider.send(message, "42")).retryable());
            }
        } finally { server.stop(0); }
    }

    @Test void enforcesHttpTimeoutWithoutExternalNetwork() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        java.util.concurrent.ExecutorService executor = java.util.concurrent.Executors.newSingleThreadExecutor();
        server.setExecutor(executor);
        var release = new java.util.concurrent.CountDownLatch(1);
        server.createContext("/emails", exchange -> {
            try { release.await(2, java.util.concurrent.TimeUnit.SECONDS); }
            catch (InterruptedException error) { Thread.currentThread().interrupt(); }
            finally { exchange.close(); }
        });
        server.start();
        try {
            var provider = new ResendEmailProvider("synthetic-key", new ObjectMapper(), URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/emails"), Duration.ofMillis(100));
            var failure = assertThrows(EmailDeliveryException.class, () -> provider.send(message, "42"));
            assertTrue(failure.retryable()); assertEquals("NETWORK_ERROR", failure.code());
        } finally { release.countDown(); server.stop(0); executor.shutdownNow(); }
    }

    @Test void rejectsInjectionAndOversizedContentBeforeProvider() {
        assertThrows(EmailDeliveryException.class, () -> new EmailMessage("from@example.invalid", "a@b.invalid,c@d.invalid", "subject", "text", "html"));
        assertThrows(EmailDeliveryException.class, () -> new EmailMessage("from@example.invalid", "to@example.invalid", "subject\r\nBcc: x", "text", "html"));
        assertThrows(EmailDeliveryException.class, () -> new EmailMessage("from@example.invalid", "to@example.invalid", "subject", "x".repeat(65537), "html"));
    }
}
