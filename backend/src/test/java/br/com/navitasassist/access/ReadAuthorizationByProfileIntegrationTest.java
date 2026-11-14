package br.com.navitasassist.access;

import static br.com.navitasassist.access.AccessTestSupport.asProfile;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import br.com.navitasassist.access.Permission.Codes;
import br.com.navitasassist.client.Client;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.ProductRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;

/**
 * Etapa 3 da minimização: cada perfil pronto continua lendo tudo o que as telas dele usam (200, com dados reais), e
 * perfis personalizados sem a permissão da área recebem 403. As permissões alternativas são testadas uma a uma.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ReadAuthorizationByProfileIntegrationTest {

    private static final String ADMIN = "ADMIN";
    private static final String DESK = "SERVICE_DESK";
    private static final String TECH = "TECHNICIAN";
    private static final String VIEWER = "VIEWER";
    private static final Set<String> ALL = Set.of(ADMIN, DESK, TECH, VIEWER);

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private ClientRepository clients;
    @Autowired private ProductRepository products;

    private long clientId;
    private long rmaId;
    private long partId;

    @BeforeEach
    void createData() throws Exception {
        Client client = new Client();
        client.setLegalName("Cliente das leituras");
        clients.saveAndFlush(client);
        clientId = client.getId();
        Product product = new Product();
        product.setSku("READ-AUTH");
        product.setName("Produto das leituras");
        product.setDefaultWarrantyMonths(12);
        products.saveAndFlush(product);
        rmaId = id(mvc.perform(post("/api/rmas").with(asProfile("admin", ADMIN)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
            .content(mapper.writeValueAsString(Map.of(
                "clientId", clientId,
                "items", List.of(Map.of("productId", product.getId(), "serialNumber", "READ-AUTH")),
                "purchaseDateUnknown", true,
                "entryDate", LocalDate.now(ZoneId.of("America/Sao_Paulo")).toString(),
                "reportedFailure", "Não liga")))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        partId = id(mvc.perform(post("/api/parts").with(asProfile("admin", ADMIN)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
            .content(mapper.writeValueAsString(Map.of("code", "READ-AUTH", "name", "Peça das leituras", "unit", "un",
                "minimumStock", 0, "unitCost", 12.5)))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mvc.perform(post("/api/parts/{id}/movements", partId).with(asProfile("admin", ADMIN)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"type\":\"ENTRY\",\"quantity\":5}")).andExpect(status().isCreated());
        mvc.perform(post("/api/rmas/{id}/parts", rmaId).with(asProfile("tech", TECH)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"partId\":" + partId + ",\"quantity\":2}")).andExpect(status().isCreated());
    }

    /** Leituras de cada tela e os perfis prontos que a abrem; todas precisam responder 200. */
    private List<Object[]> screenReads() {
        String today = LocalDate.now(ZoneId.of("America/Sao_Paulo")).toString();
        return List.of(
            // Dashboard, lista de OS, Kanban e detalhe (rma.ver: todos)
            read("/api/rmas/dashboard", ALL), read("/api/clients/summary", ALL), read("/api/products/summary", ALL),
            read("/api/rmas", ALL), read("/api/rmas/summary", ALL), read("/api/rmas/board", ALL), read("/api/rmas/" + rmaId, ALL),
            read("/api/rmas/" + rmaId + "/parts", ALL), read("/api/rmas/" + rmaId + "/repair", ALL),
            read("/api/rmas/" + rmaId + "/repair/external-components", ALL), read("/api/protocols/rmas/" + rmaId + "/executions", ALL),
            read("/api/protocols/templates", ALL), read("/api/users/assignable", ALL),
            // Abertura de OS (rma.abrir)
            read("/api/clients/options", Set.of(ADMIN, DESK)), read("/api/products/options", Set.of(ADMIN, DESK)),
            // Painel de peças da OS (pecas.reservar)
            read("/api/parts/options", Set.of(ADMIN, TECH)),
            // Clientes e Produtos (cadastros.ver + cadastros.editar)
            read("/api/clients", Set.of(ADMIN, DESK)), read("/api/clients/" + clientId, Set.of(ADMIN, DESK)), read("/api/products", Set.of(ADMIN, DESK)),
            // Peças (pecas.ver: todos)
            read("/api/parts", ALL), read("/api/parts/pending", ALL), read("/api/parts/replenishment", ALL),
            read("/api/parts/" + partId + "/movements", ALL),
            // Relatórios (relatorios.ver): filtro de cliente incluído
            read("/api/reports/rmas?entryFrom=" + today + "&entryTo=" + today, Set.of(ADMIN, TECH, VIEWER)),
            read("/api/reports/rmas/summary?entryFrom=" + today + "&entryTo=" + today, Set.of(ADMIN, TECH, VIEWER)),
            read("/api/clients/options", Set.of(ADMIN, TECH, VIEWER)),
            // Protocolos (protocolos.ver + protocolos.catalogo): seletor de produto incluído
            read("/api/products/options", Set.of(ADMIN))
        );
    }

    private static Object[] read(String path, Set<String> profiles) {
        return new Object[] {path, profiles};
    }

    @Test
    @SuppressWarnings("unchecked")
    void everyBuiltInProfileKeepsReadingWhatItsScreensUse() throws Exception {
        List<String> failures = new ArrayList<>();
        for (Object[] row : screenReads()) {
            for (String profile : (Set<String>) row[1]) {
                int status = mvc.perform(get((String) row[0]).with(asProfile("reader-" + profile.toLowerCase(), profile)))
                    .andReturn().getResponse().getStatus();
                if (status != 200) failures.add(profile + " GET " + row[0] + " -> " + status);
            }
        }
        assertEquals(List.of(), failures);
    }

    @Test
    void customProfilesWithoutTheAreaPermissionAreDenied() throws Exception {
        RequestPostProcessor reportsOnly = only(Codes.RELATORIOS_VER);
        for (String path : List.of("/api/clients", "/api/clients/" + clientId, "/api/products", "/api/parts", "/api/parts/options",
            "/api/parts/pending", "/api/parts/replenishment", "/api/parts/" + partId + "/movements", "/api/protocols/templates",
            "/api/protocols/rmas/" + rmaId + "/executions", "/api/rmas/dashboard", "/api/rmas/" + rmaId + "/parts")) {
            mvc.perform(get(path).with(reportsOnly)).andExpect(status().isForbidden());
        }
        RequestPostProcessor editorOnly = only(Codes.CADASTROS_EDITAR);
        for (String path : List.of("/api/clients", "/api/products", "/api/clients/options", "/api/products/options")) {
            mvc.perform(get(path).with(editorOnly)).andExpect(status().isForbidden());
        }
        mvc.perform(get("/api/parts").with(only(Codes.PECAS_RESERVAR))).andExpect(status().isForbidden());
        mvc.perform(get("/api/protocols/templates").with(only(Codes.CADASTROS_VER))).andExpect(status().isForbidden());
        mvc.perform(get("/api/protocols/rmas/" + rmaId + "/executions").with(only(Codes.PROTOCOLOS_VER))).andExpect(status().isForbidden());
    }

    @Test
    void eachAlternativePermissionOpensItsReadAlone() throws Exception {
        for (String code : List.of(Codes.CADASTROS_VER, Codes.RMA_VER, Codes.RMA_ABRIR, Codes.RELATORIOS_VER, Codes.PROTOCOLOS_VER, Codes.PROTOCOLOS_CATALOGO)) {
            mvc.perform(get("/api/clients/options").with(only(code))).andExpect(status().isOk());
            mvc.perform(get("/api/products/options").with(only(code))).andExpect(status().isOk());
        }
        for (String code : List.of(Codes.PECAS_VER, Codes.PECAS_RESERVAR)) {
            mvc.perform(get("/api/parts/options").with(only(code))).andExpect(status().isOk());
        }
        for (String code : List.of(Codes.PROTOCOLOS_VER, Codes.PROTOCOLOS_EXECUTAR, Codes.RMA_VER)) {
            mvc.perform(get("/api/protocols/templates").with(only(code))).andExpect(status().isOk());
        }
        mvc.perform(get("/api/clients/" + clientId).with(only(Codes.CADASTROS_VER))).andExpect(status().isOk());
        mvc.perform(get("/api/parts/pending").with(only(Codes.PECAS_VER))).andExpect(status().isOk());
    }

    @Test
    void partCostsReachOnlyWhoHasPartsView() throws Exception {
        mvc.perform(get("/api/rmas/{id}/parts", rmaId).with(only(Codes.RMA_VER)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.reservations[0].quantity").value(2))
            .andExpect(jsonPath("$.reservations[0].unitCost").value((Object) null))
            .andExpect(jsonPath("$.reservations[0].totalCost").value((Object) null))
            .andExpect(jsonPath("$.reservedCost").value((Object) null))
            .andExpect(jsonPath("$.consumedCost").value((Object) null));
        mvc.perform(get("/api/rmas/{id}/parts", rmaId).with(only(Codes.RMA_VER, Codes.PECAS_VER)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.reservations[0].unitCost").value(12.5))
            .andExpect(jsonPath("$.reservations[0].totalCost").value(25.0))
            .andExpect(jsonPath("$.reservedCost").value(25.0));
        // Escrita: quem reserva sem pecas.ver também recebe a reserva sem custos.
        mvc.perform(post("/api/rmas/{id}/parts", rmaId).with(only(Codes.PECAS_RESERVAR)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"partId\":" + partId + ",\"quantity\":1}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.quantity").value(1))
            .andExpect(jsonPath("$.unitCost").value((Object) null))
            .andExpect(jsonPath("$.totalCost").value((Object) null));
        mvc.perform(post("/api/rmas/{id}/parts", rmaId).with(only(Codes.PECAS_RESERVAR, Codes.PECAS_VER)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"partId\":" + partId + ",\"quantity\":1}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.unitCost").value(12.5));
    }

    private static RequestPostProcessor only(String... codes) {
        return user("custom").authorities(java.util.Arrays.stream(codes).map(SimpleGrantedAuthority::new).toList());
    }

    private long id(String body) throws Exception {
        return mapper.readTree(body).get("id").asLong();
    }
}
