package br.com.navitasassist.controller;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class HttpInputValidationIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private RestExceptionHandler exceptionHandler;

    static Stream<Arguments> malformedBodies() {
        return Stream.of(
            Arguments.of(HttpMethod.POST, "/api/products", "{\"sku\":\"sensitive-input\""),
            Arguments.of(HttpMethod.POST, "/api/products", ""),
            Arguments.of(HttpMethod.POST, "/api/products", "{\"defaultWarrantyMonths\":\"sensitive-input\"}"),
            Arguments.of(HttpMethod.PATCH, "/api/rmas/999/status", "{\"status\":\"sensitive-input\"}"),
            Arguments.of(HttpMethod.PUT, "/api/rmas/999", "{\"entryDate\":\"sensitive-input\"}"),
            Arguments.of(HttpMethod.POST, "/api/auth/login", "{\"username\":\"sensitive-input\",\"password\":\"sensitive-password\"")
        );
    }

    @ParameterizedTest
    @MethodSource("malformedBodies")
    void malformedBodyReturnsBadRequestWithoutLeakingInput(HttpMethod method, String path, String body) throws Exception {
        ResultActions result = mockMvc.perform(request(method, path).with(user("admin").roles("ADMIN")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content(body));
        assertBadRequest(result, "Malformed request body").andExpect(jsonPath("$.details").isEmpty());
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "/api/products/sensitive-input", "/api/products/9223372036854775808",
        "/api/clients/sensitive-input", "/api/rmas/sensitive-input"
    })
    void malformedIdReturnsBadRequest(String path) throws Exception {
        ResultActions result = mockMvc.perform(get(path).with(user("admin").roles("ADMIN")));
        assertBadRequest(result, "Invalid request parameter")
            .andExpect(jsonPath("$.details[0]").value("id: invalid value"))
            .andExpect(content().string(not(containsString("9223372036854775808"))));
    }

    @Test
    void invalidStatusFilterReturnsBadRequest() throws Exception {
        ResultActions result = mockMvc.perform(get("/api/rmas").param("status", "sensitive-input")
            .with(user("viewer").roles("VIEWER")));
        assertBadRequest(result, "Invalid request parameter").andExpect(jsonPath("$.details[0]").value("status: invalid value"));
    }

    @Test
    void anonymousMalformedRequestsStillRequireAuthentication() throws Exception {
        mockMvc.perform(get("/api/products/sensitive-input")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/products").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void forbiddenMalformedRequestsStillRequireAuthorization() throws Exception {
        mockMvc.perform(post("/api/products").with(user("viewer").roles("VIEWER")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content("{")).andExpect(status().isForbidden());
        mockMvc.perform(put("/api/users/sensitive-input").with(user("viewer").roles("VIEWER")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content("{")).andExpect(status().isForbidden());
    }

    @Test
    void malformedWriteWithoutCsrfRemainsForbidden() throws Exception {
        mockMvc.perform(post("/api/products").with(user("admin").roles("ADMIN"))
            .contentType(MediaType.APPLICATION_JSON).content("{")).andExpect(status().isForbidden());
    }

    @Test
    void validInputsNotFoundAndBeanValidationKeepTheirContracts() throws Exception {
        mockMvc.perform(get("/api/rmas").param("status", "RECEIVED").param("query", "NAV-68-no-matching-rma")
            .with(user("viewer").roles("VIEWER")))
            .andExpect(status().isOk()).andExpect(jsonPath("$").isArray());
        mockMvc.perform(get("/api/products/{id}", Long.MAX_VALUE).with(user("viewer").roles("VIEWER")))
            .andExpect(status().isNotFound()).andExpect(jsonPath("$.status").value(404));
        mockMvc.perform(post("/api/products").with(user("admin").roles("ADMIN")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Validation failed"));
    }

    @Test
    void unexpectedIllegalArgumentRemainsGenericServerError() throws Exception {
        // Local fixture exercises exception dispatch without adding a route to the application.
        @RestController
        class FailingController {
            @GetMapping("/unexpected")
            public void fail() {
                throw new IllegalArgumentException("sensitive-input");
            }
        }
        standaloneSetup(new FailingController()).setControllerAdvice(exceptionHandler).build()
            .perform(get("/unexpected"))
            .andExpect(status().isInternalServerError())
            .andExpect(jsonPath("$.status").value(500))
            .andExpect(jsonPath("$.message").value("Unexpected error"))
            .andExpect(jsonPath("$.details").isEmpty())
            .andExpect(content().string(not(containsString("sensitive-input"))));
    }

    private ResultActions assertBadRequest(ResultActions result, String message) throws Exception {
        return result.andExpect(status().isBadRequest())
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
            .andExpect(header().doesNotExist(HttpHeaders.WWW_AUTHENTICATE))
            .andExpect(jsonPath("$.timestamp").isString())
            .andExpect(jsonPath("$.status").value(400))
            .andExpect(jsonPath("$.error").value("Bad Request"))
            .andExpect(jsonPath("$.message").value(message))
            .andExpect(jsonPath("$.details").isArray())
            .andExpect(content().string(not(containsString("sensitive-"))))
            .andExpect(content().string(not(containsString("Exception"))))
            .andExpect(content().string(not(containsString("java."))));
    }
}
