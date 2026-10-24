package br.com.navitasassist.notification;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import br.com.navitasassist.client.Client;
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
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = { "navitas.notifications.email.enabled=true", "navitas.notifications.email.domain=empresa.com.br", "navitas.notifications.email.from=alertas@empresa.com.br" })
class NotificationEmailIntegrationTest {

    @MockBean
    private JavaMailSender mailSender;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private RmaService rmaService;

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

    private UserAccount technician;
    private RmaResponse rma;

    @BeforeEach
    void setUp() {
        cleanUp();
        setAssignmentEmail(true);
        technician = new UserAccount();
        technician.setUsername("nav40-mail-tech");
        technician.setFullName("Técnico e-mail");
        technician.setPasswordHash("not-used");
        technician.setRole(UserRole.TECHNICIAN);
        technician = userAccountRepository.save(technician);
        Client client = new Client();
        client.setLegalName("Cliente e-mail");
        client = clientRepository.save(client);
        Product product = new Product();
        product.setSku("SKU-NAV40-MAIL");
        product.setName("Produto e-mail");
        product = productRepository.save(product);
        rma = rmaService.create(new CreateRmaRequest(client.getId(), List.of(new RmaItemRequest(product.getId(), null, "SER-MAIL", null)), null, true, LocalDate.now(), null, "Falha", null, null, RmaPriority.LOW, null, null, null));
        reset(mailSender);
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
    void sendsOnlyToTheCorporateDomainWithoutLinks() throws Exception {
        assign().andExpect(status().isOk());

        ArgumentCaptor<SimpleMailMessage> message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(message.capture());
        assertEquals("nav40-mail-tech@empresa.com.br", message.getValue().getTo()[0]);
        assertEquals("alertas@empresa.com.br", message.getValue().getFrom());
        assertFalse(message.getValue().getText().contains("http"));
        assertEquals(NotificationEmailStatus.SENT, assignmentNotification().getEmailStatus());
    }

    @Test
    void emailFailureDoesNotUndoTheRmaOperation() throws Exception {
        doThrow(new MailSendException("SMTP indisponível")).when(mailSender).send(any(SimpleMailMessage.class));

        assign().andExpect(status().isOk()).andExpect(jsonPath("$.assigneeId").value(technician.getId()));

        assertEquals(technician.getId(), rmaRecordRepository.findById(rma.id()).orElseThrow().getAssignee().getId());
        Notification notification = assignmentNotification();
        assertEquals(NotificationEmailStatus.FAILED, notification.getEmailStatus());
        mockMvc.perform(get("/api/notifications").with(user("nav40-mail-tech").roles("TECHNICIAN"))).andExpect(jsonPath("$[0].eventType").value("RMA_ASSIGNED"));
        mockMvc.perform(get("/api/notification-rules/failures").with(user("admin").roles("ADMIN")))
            .andExpect(jsonPath("$[0].source").value("EMAIL"))
            .andExpect(jsonPath("$[0].recipient").value("nav40-mail-tech"));
    }

    private org.springframework.test.web.servlet.ResultActions assign() throws Exception {
        return mockMvc.perform(patch("/api/rmas/{id}/assignee", rma.id()).with(user("admin").roles("ADMIN")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(Map.of("assigneeId", technician.getId()))));
    }

    private Notification assignmentNotification() {
        return notificationRepository.findAll().stream().filter(notification -> notification.getEventType() == NotificationEventType.RMA_ASSIGNED).findFirst().orElseThrow();
    }

    private void setAssignmentEmail(boolean enabled) {
        NotificationRule rule = notificationRuleRepository.findByEventType(NotificationEventType.RMA_ASSIGNED).orElseThrow();
        rule.setEmailEnabled(enabled);
        notificationRuleRepository.save(rule);
    }
}
