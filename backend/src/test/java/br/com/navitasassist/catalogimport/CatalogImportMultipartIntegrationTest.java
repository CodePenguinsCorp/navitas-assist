package br.com.navitasassist.catalogimport;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Bean;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.*;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.util.LinkedMultiValueMap;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class CatalogImportMultipartIntegrationTest {
    @Autowired TestRestTemplate http;
    @TestConfiguration static class AllowImportRequests {
        @Bean @Order(0) SecurityFilterChain importTestChain(HttpSecurity security) throws Exception {
            return security.securityMatcher("/api/clients/imports/**").csrf(csrf -> csrf.disable()).authorizeHttpRequests(auth -> auth.anyRequest().permitAll()).build();
        }
    }
    @Test void realMultipartLimitReturnsPortuguese413() {
        var body = new LinkedMultiValueMap<String, Object>();
        body.add("file", new ByteArrayResource(new byte[2 * 1024 * 1024 + 1]) { @Override public String getFilename() { return "arquivo.csv"; } });
        var headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);
        var response = http.postForEntity("/api/clients/imports/preview", new HttpEntity<>(body, headers), Map.class);
        assertEquals(HttpStatus.PAYLOAD_TOO_LARGE, response.getStatusCode());
        assertEquals("O arquivo excede 2 MiB", response.getBody().get("message"));
        assertEquals(List.of(), response.getBody().get("details"));
    }
    @Test void wrongOuterContentTypeReturnsPortuguese415() {
        var headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        var response = http.postForEntity("/api/clients/imports/preview", new HttpEntity<>("{}", headers), Map.class);
        assertEquals(HttpStatus.UNSUPPORTED_MEDIA_TYPE, response.getStatusCode());
        assertEquals("Envie um arquivo CSV como multipart/form-data", response.getBody().get("message"));
    }
}
