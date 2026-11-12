package br.com.navitasassist.notification;

import static br.com.navitasassist.access.AccessTestSupport.asProfile;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import br.com.navitasassist.access.AccessProfile;
import br.com.navitasassist.repository.AccessProfileRepository;
import br.com.navitasassist.repository.NotificationRuleRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Um perfil destinatário apagado entre a validação e a gravação da regra viola a FK: a API responde 400, não 500.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class NotificationRuleProfileRaceIntegrationTest {

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private AccessProfileRepository profiles;
    @SpyBean private NotificationRuleRepository rules;

    @AfterEach
    void cleanup() {
        reset(rules);
    }

    @Test
    void profileDeletedConcurrentlyIsABadRequest() throws Exception {
        Set<Long> before = recipientIds();
        AccessProfile viewer = profiles.findByLegacyCode("VIEWER").orElseThrow();
        doThrow(new DataIntegrityViolationException("fk_rule_recipient_profiles_profile"))
            .when(rules).saveAndFlush(any(NotificationRule.class));

        mvc.perform(put("/api/notification-rules/RMA_ASSIGNED").with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("enabled", true, "severity", "INFO",
                    "recipientProfileIds", List.of(viewer.getId()), "notifyAssignee", true, "emailEnabled", false,
                    "userMutable", false))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Um dos perfis destinatários não existe mais."));

        reset(rules);
        assertEquals(before, recipientIds());
    }

    private Set<Long> recipientIds() {
        return rules.findByEventType(NotificationEventType.RMA_ASSIGNED).orElseThrow().getRecipientProfiles().stream()
            .map(AccessProfile::getId).collect(Collectors.toSet());
    }
}
