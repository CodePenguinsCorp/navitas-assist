package br.com.navitasassist.notification;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.net.ServerSocket;
import java.net.Socket;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.config.NotificationAsyncConfig;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.NotificationEventRepository;
import br.com.navitasassist.repository.NotificationRepository;
import br.com.navitasassist.repository.NotificationRuleRepository;
import br.com.navitasassist.repository.ProductRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.rma.CreateRmaRequest;
import br.com.navitasassist.rma.RmaItemRequest;
import br.com.navitasassist.rma.RmaPriority;
import br.com.navitasassist.rma.RmaResponse;
import br.com.navitasassist.service.RmaService;
import br.com.navitasassist.user.UserAccount;
import br.com.navitasassist.user.UserRole;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Real JavaMail against an SMTP server that accepts the connection and never answers: the configured timeouts must end
 * the delivery, and the RMA operation must already have completed.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class NotificationSmtpTimeoutIntegrationTest {

    private static final ServerSocket SILENT_SMTP = openSilentSmtp();
    private static final List<Socket> CONNECTIONS = new CopyOnWriteArrayList<>();

    @DynamicPropertySource
    static void mailProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.mail.host", () -> "127.0.0.1");
        registry.add("spring.mail.port", SILENT_SMTP::getLocalPort);
        registry.add("spring.mail.properties[mail.smtp.connectiontimeout]", () -> "500");
        registry.add("spring.mail.properties[mail.smtp.timeout]", () -> "500");
        registry.add("spring.mail.properties[mail.smtp.writetimeout]", () -> "500");
        registry.add("navitas.notifications.email.enabled", () -> "true");
        registry.add("navitas.notifications.email.domain", () -> "empresa.com.br");
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JavaMailSender mailSender;

    @Autowired
    private RmaService rmaService;

    @Autowired
    @Qualifier(NotificationAsyncConfig.NOTIFICATION_EXECUTOR)
    private ThreadPoolTaskExecutor notificationExecutor;

    @Autowired
    private NotificationRepository notificationRepository;

    @Autowired
    private NotificationEventRepository notificationEventRepository;

    @Autowired
    private NotificationRuleRepository notificationRuleRepository;

    @Autowired
    private UserAccountRepository userAccountRepository;

    @Autowired
    private RmaRecordRepository rmaRecordRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private ClientRepository clientRepository;

    @AfterAll
    static void closeServer() throws IOException {
        for (Socket connection : CONNECTIONS) {
            connection.close();
        }
        SILENT_SMTP.close();
    }

    @AfterEach
    void cleanUp() {
        notificationRepository.deleteAll();
        notificationEventRepository.deleteAll();
        rmaRecordRepository.deleteAll();
        productRepository.deleteAll();
        clientRepository.deleteAll();
        userAccountRepository.findAll().stream().filter(account -> account.getUsername().startsWith("nav40-")).forEach(userAccountRepository::delete);
        setAssignmentEmail(false);
    }

    @Test
    void smtpTimeoutEndsDeliveryWithoutUndoingTheRmaOperation() throws Exception {
        assertEquals("500", ((JavaMailSenderImpl) mailSender).getJavaMailProperties().getProperty("mail.smtp.timeout"));
        setAssignmentEmail(true);
        UserAccount technician = new UserAccount();
        technician.setUsername("nav40-smtp-tech");
        technician.setFullName("Técnico SMTP");
        technician.setPasswordHash("not-used");
        technician.setRole(UserRole.TECHNICIAN);
        technician = userAccountRepository.save(technician);
        Client client = new Client();
        client.setLegalName("Cliente SMTP");
        client = clientRepository.save(client);
        Product product = new Product();
        product.setSku("SKU-NAV40-SMTP");
        product.setName("Produto SMTP");
        product = productRepository.save(product);
        RmaResponse rma = rmaService.create(new CreateRmaRequest(client.getId(), List.of(new RmaItemRequest(product.getId(), null, "SER-SMTP", null)), null, true, LocalDate.now(), null, "Falha", null, null, RmaPriority.LOW, null, null, null));
        NotificationTestSupport.awaitIdle(notificationExecutor);

        long started = System.nanoTime();
        mockMvc.perform(patch("/api/rmas/{id}/assignee", rma.id()).with(user("admin").roles("ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("assigneeId", technician.getId()))))
            .andExpect(status().isOk());
        long requestMillis = (System.nanoTime() - started) / 1_000_000;
        NotificationTestSupport.awaitIdle(notificationExecutor);

        assertTrue(requestMillis < 1000, "RMA request waited for SMTP: " + requestMillis + " ms");
        assertEquals(technician.getId(), rmaRecordRepository.findById(rma.id()).orElseThrow().getAssignee().getId());
        Notification notification = notificationRepository.findAll().stream().filter(candidate -> candidate.getEventType() == NotificationEventType.RMA_ASSIGNED).findFirst().orElseThrow();
        assertEquals(NotificationEmailStatus.FAILED, notification.getEmailStatus());
        assertTrue(notification.getEmailError().toLowerCase().contains("timed out") || notification.getEmailError().toLowerCase().contains("timeout"), notification.getEmailError());
    }

    private void setAssignmentEmail(boolean enabled) {
        NotificationRule rule = notificationRuleRepository.findByEventType(NotificationEventType.RMA_ASSIGNED).orElseThrow();
        rule.setEmailEnabled(enabled);
        notificationRuleRepository.save(rule);
    }

    private static ServerSocket openSilentSmtp() {
        try {
            ServerSocket server = new ServerSocket(0);
            Thread acceptor = new Thread(() -> {
                while (!server.isClosed()) {
                    try {
                        CONNECTIONS.add(server.accept());
                    } catch (IOException closed) {
                        return;
                    }
                }
            }, "silent-smtp");
            acceptor.setDaemon(true);
            acceptor.start();
            return server;
        } catch (IOException exception) {
            throw new IllegalStateException(exception);
        }
    }
}
