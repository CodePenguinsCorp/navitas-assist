package br.com.navitasassist.auth;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.Collections;
import br.com.navitasassist.rma.CreateRmaRequest;
import br.com.navitasassist.rma.RmaItemRequest;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class InputLimitsIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired Validator validator;

    @ParameterizedTest
    @ValueSource(strings = {"/api/clients", "/api/products", "/api/parts", "/api/profiles", "/api/users",
        "/api/rmas", "/api/rmas/summary", "/api/rmas/board"})
    void searchRejectsMoreThanOneHundredCharacters(String path) throws Exception {
        mvc.perform(get(path).param("query", "x".repeat(101)).with(user("reader").authorities(
                new SimpleGrantedAuthority("rma.ver"), new SimpleGrantedAuthority("usuarios.gerir"),
                new SimpleGrantedAuthority("perfis.gerir"))))
            .andExpect(status().isBadRequest());
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/clients", "/api/products", "/api/parts", "/api/profiles", "/api/users",
        "/api/rmas", "/api/rmas/summary", "/api/rmas/board"})
    void searchAcceptsOneHundredCharacters(String path) throws Exception {
        mvc.perform(get(path).param("query", "x".repeat(100)).with(user("reader").authorities(
                new SimpleGrantedAuthority("rma.ver"), new SimpleGrantedAuthority("usuarios.gerir"),
                new SimpleGrantedAuthority("perfis.gerir"))))
            .andExpect(status().isOk());
    }

    @Test void rmaAcceptsTwentyItemsAndRejectsTwentyOne() {
        assertThat(validator.validate(request(20))).isEmpty();
        assertThat(validator.validate(request(21))).anySatisfy(violation ->
            assertThat(violation.getPropertyPath().toString()).isEqualTo("items"));
    }

    @Test void rmaUpdateAlsoRejectsTwentyOneItems() {
        var request = new br.com.navitasassist.rma.UpdateRmaRequest(null,
            Collections.nCopies(21, new RmaItemRequest(1L, null, null, null)),
            null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null);
        assertThat(validator.validate(request)).anySatisfy(violation ->
            assertThat(violation.getPropertyPath().toString()).isEqualTo("items"));
    }

    @Test void savedKanbanSearchHasTheSameOneHundredCharacterLimit() {
        assertThat(validator.validate(new br.com.navitasassist.kanban.KanbanViewFilters(
            "x".repeat(100), null, null, null, null, false, null, null, null, null, null, null))).isEmpty();
        assertThat(validator.validate(new br.com.navitasassist.kanban.KanbanViewFilters(
            "x".repeat(101), null, null, null, null, false, null, null, null, null, null, null))).isNotEmpty();
    }

    @Test
    @org.springframework.transaction.annotation.Transactional
    void itemLimitsAreEnforcedOnCreateAndUpdateBeforePersistence() throws Exception {
        var client = new br.com.navitasassist.client.Client();
        client.setLegalName("Cliente limites");
        client = clients.saveAndFlush(client);
        var product = new br.com.navitasassist.product.Product();
        product.setSku("LIMIT-20");
        product.setName("Produto limites");
        product.setDefaultWarrantyMonths(12);
        product = products.saveAndFlush(product);
        long before = rmas.count();
        var item = java.util.Map.of("productId", product.getId(), "batchNumber", "LOT-LIMIT");
        var payload = new java.util.HashMap<String, Object>();
        payload.put("clientId", client.getId());
        payload.put("entryDate", "2026-02-01");
        payload.put("purchaseDateUnknown", true);
        payload.put("reportedFailure", "Falha");
        payload.put("items", Collections.nCopies(21, item));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/rmas")
                .with(user("admin").authorities(new SimpleGrantedAuthority("rma.abrir")))
                .with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf())
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON).content(json.writeValueAsString(payload)))
            .andExpect(status().isBadRequest())
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.details[0]")
                .value(org.hamcrest.Matchers.containsString("20 itens")));
        assertThat(rmas.count()).isEqualTo(before);
        payload.put("items", Collections.nCopies(20, item));
        var created = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/rmas")
                .with(user("admin").authorities(new SimpleGrantedAuthority("rma.abrir")))
                .with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf())
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON).content(json.writeValueAsString(payload)))
            .andExpect(status().isCreated()).andReturn();
        long id = json.readTree(created.getResponse().getContentAsString()).get("id").asLong();
        for (int count : new int[] {21, 20}) {
            mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/rmas/" + id)
                    .with(user("admin").authorities(new SimpleGrantedAuthority("rma.editar")))
                    .with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf())
                    .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                    .content(json.writeValueAsString(java.util.Map.of("items", Collections.nCopies(count, item)))))
                .andExpect(count == 21 ? status().isBadRequest() : status().isOk());
        }
        assertThat(rmas.findById(id).orElseThrow().getItems()).hasSize(20);
        assertThat(rmas.count()).isEqualTo(before + 1);
    }

    @Autowired br.com.navitasassist.repository.ClientRepository clients;
    @Autowired br.com.navitasassist.repository.ProductRepository products;
    @Autowired br.com.navitasassist.repository.RmaRecordRepository rmas;
    @Autowired com.fasterxml.jackson.databind.ObjectMapper json;

    private CreateRmaRequest request(int count) {
        return new CreateRmaRequest(1L, Collections.nCopies(count, new RmaItemRequest(1L, null, null, null)),
            LocalDate.of(2026, 1, 1), false, LocalDate.of(2026, 2, 1), null, "Falha", null, null,
            null, null, null, null, null);
    }
}
