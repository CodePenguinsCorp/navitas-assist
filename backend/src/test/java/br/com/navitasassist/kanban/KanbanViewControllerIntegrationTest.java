package br.com.navitasassist.kanban;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.LinkedHashMap;
import java.util.Map;

import br.com.navitasassist.repository.KanbanViewRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.user.UserAccount;
import br.com.navitasassist.user.UserRole;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class KanbanViewControllerIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private KanbanViewRepository kanbanViewRepository;

    @Autowired
    private UserAccountRepository userAccountRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @BeforeEach
    void prepareUsers() {
        kanbanViewRepository.deleteAll();
        userAccountRepository.findByUsernameIgnoreCase("view.alice").ifPresent(userAccountRepository::delete);
        userAccountRepository.findByUsernameIgnoreCase("view.bob").ifPresent(userAccountRepository::delete);
        createUser("view.alice");
        createUser("view.bob");
    }

    @Test
    void shouldPersistOwnViewsAndKeepOnlyOneDefault() throws Exception {
        mockMvc.perform(post("/api/kanban-views")
                .with(user("view.alice").roles("VIEWER"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(viewJson("  Minha visão  ", true, filters("urgente"))))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.name").value("Minha visão"))
            .andExpect(jsonPath("$.defaultView").value(true))
            .andExpect(jsonPath("$.filters.query").value("urgente"));

        mockMvc.perform(post("/api/kanban-views")
                .with(user("view.alice").roles("VIEWER"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(viewJson("Segunda", true, filters("garantia"))))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.defaultView").value(true));

        mockMvc.perform(get("/api/kanban-views").with(user("view.alice").roles("VIEWER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(2))
            .andExpect(jsonPath("$[0].name").value("Minha visão"))
            .andExpect(jsonPath("$[0].defaultView").value(false))
            .andExpect(jsonPath("$[1].name").value("Segunda"))
            .andExpect(jsonPath("$[1].defaultView").value(true));

        mockMvc.perform(post("/api/kanban-views")
                .with(user("view.alice").roles("VIEWER"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(viewJson("minha VISÃO", false, filters(null))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("A Kanban view with this name already exists."));
    }

    @Test
    void shouldHideViewsOwnedByAnotherUser() throws Exception {
        String response = mockMvc.perform(post("/api/kanban-views")
                .with(user("view.alice").roles("VIEWER"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(viewJson("Privada", false, filters(null))))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        long viewId = objectMapper.readTree(response).get("id").asLong();

        mockMvc.perform(get("/api/kanban-views").with(user("view.bob").roles("VIEWER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(0));

        mockMvc.perform(put("/api/kanban-views/{id}", viewId)
                .with(user("view.bob").roles("VIEWER"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(viewJson("Invadida", false, filters(null))))
            .andExpect(status().isNotFound());

        mockMvc.perform(patch("/api/kanban-views/{id}/default", viewId)
                .with(user("view.bob").roles("VIEWER"))
                .with(csrf()))
            .andExpect(status().isNotFound());

        mockMvc.perform(delete("/api/kanban-views/{id}", viewId)
                .with(user("view.bob").roles("VIEWER"))
                .with(csrf()))
            .andExpect(status().isNotFound());
    }

    @Test
    void shouldRenameSetDefaultAndDeleteOwnView() throws Exception {
        String response = mockMvc.perform(post("/api/kanban-views")
                .with(user("view.alice").roles("VIEWER"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(viewJson("Original", false, filters("inicial"))))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        long viewId = objectMapper.readTree(response).get("id").asLong();

        mockMvc.perform(put("/api/kanban-views/{id}", viewId)
                .with(user("view.alice").roles("VIEWER"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(viewJson("Renomeada", false, filters("inicial"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("Renomeada"));

        mockMvc.perform(patch("/api/kanban-views/{id}/default", viewId)
                .with(user("view.alice").roles("VIEWER"))
                .with(csrf()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.defaultView").value(true));

        mockMvc.perform(delete("/api/kanban-views/{id}", viewId)
                .with(user("view.alice").roles("VIEWER"))
                .with(csrf()))
            .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/kanban-views").with(user("view.alice").roles("VIEWER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void shouldValidateNamesAndFilterCombinations() throws Exception {
        mockMvc.perform(post("/api/kanban-views")
                .with(user("view.alice").roles("VIEWER"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(viewJson(" ", false, filters(null))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.details", hasItem(startsWith("name:"))));

        Map<String, Object> invalidFilters = filters(null);
        invalidFilters.put("assigneeId", 7);
        invalidFilters.put("unassignedOnly", true);
        mockMvc.perform(post("/api/kanban-views")
                .with(user("view.alice").roles("VIEWER"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(viewJson("Conflito", false, invalidFilters)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Assignee and unassigned filters cannot be combined."));

        Map<String, Object> invalidRange = filters(null);
        invalidRange.put("entryFrom", "2026-10-20");
        invalidRange.put("entryTo", "2026-10-19");
        mockMvc.perform(post("/api/kanban-views")
                .with(user("view.alice").roles("VIEWER"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(viewJson("Datas", false, invalidRange)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("The entry start date cannot be after the end date."));
    }

    @Test
    void shouldRequireAuthentication() throws Exception {
        mockMvc.perform(get("/api/kanban-views"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void shouldPersistLaneSettingsAndUpdateThemOnlyForTheirOwner() throws Exception {
        Map<String, Object> grouped = filters("urgente");
        grouped.put("groupBy", "ASSIGNEE");
        grouped.put("descendingLanes", true);
        grouped.put("emptyLanesFirst", true);
        String response = mockMvc.perform(post("/api/kanban-views")
                .with(user("view.alice").roles("VIEWER")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(viewJson("Raias", false, grouped)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.filters.groupBy").value("ASSIGNEE"))
            .andExpect(jsonPath("$.filters.descendingLanes").value(true))
            .andExpect(jsonPath("$.filters.emptyLanesFirst").value(true))
            .andReturn().getResponse().getContentAsString();
        long id = objectMapper.readTree(response).get("id").asLong();
        mockMvc.perform(get("/api/kanban-views").with(user("view.alice").roles("VIEWER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].filters.groupBy").value("ASSIGNEE"));
        grouped.put("groupBy", "PRODUCT");
        mockMvc.perform(put("/api/kanban-views/{id}", id)
                .with(user("view.bob").roles("VIEWER")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(viewJson("Raias", false, grouped)))
            .andExpect(status().isNotFound());
        mockMvc.perform(put("/api/kanban-views/{id}", id)
                .with(user("view.alice").roles("VIEWER")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(viewJson("Raias", false, grouped)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.filters.groupBy").value("PRODUCT"));
    }

    @Test
    void shouldDefaultLegacyViewsToUngroupedAndRejectUnsupportedGrouping() throws Exception {
        mockMvc.perform(post("/api/kanban-views")
                .with(user("view.alice").roles("VIEWER")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(viewJson("Legada", false, filters(null))))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.filters.groupBy").value("NONE"))
            .andExpect(jsonPath("$.filters.descendingLanes").value(false))
            .andExpect(jsonPath("$.filters.emptyLanesFirst").value(false));
        for (Object invalid : new Object[] {"BLOCKED", "customField", 2}) {
            Map<String, Object> grouped = filters(null);
            grouped.put("groupBy", invalid);
            mockMvc.perform(post("/api/kanban-views")
                    .with(user("view.alice").roles("VIEWER")).with(csrf())
                    .contentType(MediaType.APPLICATION_JSON).content(viewJson("Inválida", false, grouped)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Invalid request body"));
        }
    }

    private String viewJson(String name, boolean defaultView, Map<String, Object> filters) throws Exception {
        return objectMapper.writeValueAsString(Map.of(
            "name", name,
            "defaultView", defaultView,
            "filters", filters
        ));
    }

    private Map<String, Object> filters(String query) {
        Map<String, Object> filters = new LinkedHashMap<>();
        filters.put("query", query);
        filters.put("priority", null);
        filters.put("status", null);
        filters.put("warranty", null);
        filters.put("assigneeId", null);
        filters.put("unassignedOnly", false);
        filters.put("entryFrom", null);
        filters.put("entryTo", null);
        filters.put("updatedFrom", null);
        filters.put("updatedTo", null);
        return filters;
    }

    private void createUser(String username) {
        UserAccount userAccount = new UserAccount();
        userAccount.setUsername(username);
        userAccount.setFullName(username);
        userAccount.setPasswordHash(passwordEncoder.encode("password123"));
        userAccount.setRole(UserRole.VIEWER);
        userAccount.setActive(true);
        userAccountRepository.save(userAccount);
    }
}
