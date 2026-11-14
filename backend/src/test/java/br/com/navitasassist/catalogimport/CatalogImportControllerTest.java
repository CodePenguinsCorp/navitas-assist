package br.com.navitasassist.catalogimport;

import br.com.navitasassist.controller.CatalogImportController;
import br.com.navitasassist.controller.CatalogImportExceptionHandler;
import br.com.navitasassist.service.CatalogImportService;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class CatalogImportControllerTest {
    MockMvc mvc;
    @BeforeEach void setup() {
        var service = new CatalogImportService(org.mockito.Mockito.mock(br.com.navitasassist.service.AuditService.class), mock(br.com.navitasassist.repository.ClientRepository.class), mock(br.com.navitasassist.repository.ProductRepository.class), mock(br.com.navitasassist.service.ClientService.class), mock(br.com.navitasassist.service.ProductService.class), jakarta.validation.Validation.buildDefaultValidatorFactory().getValidator());
        mvc = MockMvcBuilders.standaloneSetup(new CatalogImportController(service)).setControllerAdvice(new CatalogImportExceptionHandler()).build();
    }
    @Test void templateIsUtf8BomAttachmentWithExample() throws Exception {
        for (String resource : new String[]{"clients", "products"}) {
            byte[] bytes = mvc.perform(get("/api/" + resource + "/imports/template")).andExpect(status().isOk()).andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.containsString("attachment"))).andReturn().getResponse().getContentAsByteArray();
            assertArrayEquals(new byte[]{(byte)239, (byte)187, (byte)191}, java.util.Arrays.copyOf(bytes, 3));
            assertEquals(2, new String(bytes, StandardCharsets.UTF_8).lines().count());
        }
    }
    @Test void invalidFileAndMissingMultipartProducePortugueseApiErrors() throws Exception {
        mvc.perform(multipart("/api/clients/imports/preview").file(new MockMultipartFile("file", "arquivo.xlsx", "text/plain", new byte[]{1}))).andExpect(status().isUnsupportedMediaType()).andExpect(jsonPath("message").value("Envie um arquivo CSV")).andExpect(jsonPath("details").isArray());
        mvc.perform(multipart("/api/products/imports/confirm")).andExpect(status().isBadRequest()).andExpect(jsonPath("message").value("Selecione um arquivo CSV"));
    }
    @Test void malformedContentIsRejectedWithoutEchoingItsValues() throws Exception {
        mvc.perform(multipart("/api/clients/imports/preview").file(new MockMultipartFile("file", "dados.csv", "text/csv", "razao_social;email\n\"dado sigiloso".getBytes(StandardCharsets.UTF_8)))).andExpect(status().isBadRequest()).andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("dado sigiloso"))));
    }
}
