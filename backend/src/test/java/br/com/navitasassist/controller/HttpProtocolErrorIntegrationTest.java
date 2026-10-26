package br.com.navitasassist.controller;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.navitasassist.repository.ProductRepository;
import br.com.navitasassist.service.ProductService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class HttpProtocolErrorIntegrationTest {

    @Autowired private MockMvc mvc;
    @Autowired private ProductRepository products;

    @Test
    void unsupportedMethodPreservesAllowAndApiErrorContract() throws Exception {
        mvc.perform(patch("/api/products").with(user("admin").roles("ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"secret\":\"private-payload\"}"))
            .andExpect(status().isMethodNotAllowed())
            .andExpect(header().string(HttpHeaders.ALLOW, containsString("GET")))
            .andExpect(header().string(HttpHeaders.ALLOW, containsString("POST")))
            .andExpect(header().string(HttpHeaders.ALLOW, not(containsString("PATCH"))))
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$.status").value(405))
            .andExpect(jsonPath("$.error").value("Method Not Allowed"))
            .andExpect(jsonPath("$.message").value("HTTP method not supported"))
            .andExpect(jsonPath("$.timestamp").isNotEmpty())
            .andExpect(jsonPath("$.details").isArray())
            .andExpect(content().string(not(containsString("private-payload"))));
    }

    @Test
    void unsupportedMediaTypePreservesAcceptAndDoesNotCreateProduct() throws Exception {
        long before = products.count();
        mvc.perform(post("/api/products").with(user("desk").roles("SERVICE_DESK")).with(csrf())
                .contentType(MediaType.TEXT_PLAIN).content("private-payload"))
            .andExpect(status().isUnsupportedMediaType())
            .andExpect(header().string(HttpHeaders.ACCEPT, containsString("application/json")))
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$.status").value(415))
            .andExpect(jsonPath("$.error").value("Unsupported Media Type"))
            .andExpect(jsonPath("$.message").value("Content type not supported"))
            .andExpect(jsonPath("$.timestamp").isNotEmpty())
            .andExpect(jsonPath("$.details").isArray())
            .andExpect(content().string(not(containsString("private-payload"))));
        assertEquals(before, products.count());
    }

    @Test
    void securityFiltersStillRejectUnauthenticatedForbiddenAndCsrfRequests() throws Exception {
        mvc.perform(post("/api/products").with(csrf()).contentType(MediaType.TEXT_PLAIN).content("invalid"))
            .andExpect(status().isUnauthorized());
        mvc.perform(patch("/api/products").with(csrf())).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/products").with(user("viewer").roles("VIEWER")).with(csrf()).contentType(MediaType.TEXT_PLAIN).content("invalid"))
            .andExpect(status().isForbidden());
        mvc.perform(patch("/api/products").with(user("desk").roles("SERVICE_DESK")).with(csrf()))
            .andExpect(status().isForbidden());
        mvc.perform(post("/api/products").with(user("admin").roles("ADMIN")).contentType(MediaType.TEXT_PLAIN).content("invalid"))
            .andExpect(status().isForbidden());
        mvc.perform(patch("/api/products").with(user("admin").roles("ADMIN"))).andExpect(status().isForbidden());
    }

    @Test
    void validRequestsValidationAndNotFoundKeepExistingStatusCodes() throws Exception {
        mvc.perform(get("/api/products").with(user("viewer").roles("VIEWER"))).andExpect(status().isOk());
        mvc.perform(post("/api/products").with(user("admin").roles("ADMIN")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Validation failed"));
        mvc.perform(get("/api/products/9223372036854775807").with(user("viewer").roles("VIEWER")))
            .andExpect(status().isNotFound());
    }

    @Test
    void unexpectedServiceFailureRemainsGeneric500WithoutLeakingDetails() throws Exception {
        ProductService service = mock(ProductService.class);
        when(service.listAll()).thenThrow(new IllegalStateException("private-service-details"));
        MockMvc boundary = MockMvcBuilders.standaloneSetup(new ProductController(service)).setControllerAdvice(new RestExceptionHandler()).build();
        boundary.perform(get("/api/products"))
            .andExpect(status().isInternalServerError())
            .andExpect(jsonPath("$.status").value(500))
            .andExpect(jsonPath("$.message").value("Unexpected error"))
            .andExpect(content().string(not(containsString("private-service-details"))));
    }
}
