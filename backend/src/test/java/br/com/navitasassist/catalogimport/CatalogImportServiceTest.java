package br.com.navitasassist.catalogimport;
import br.com.navitasassist.service.CatalogImportService;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.ProductRepository;
import br.com.navitasassist.service.ClientService;
import br.com.navitasassist.service.ProductService;
import jakarta.validation.Validation;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CatalogImportServiceTest {
    private CatalogImportService service;
    private ClientRepository clients;
    private ProductRepository products;
    private ClientService clientService;
    private ProductService productService;

    @BeforeEach void setup() {
        clients = mock(ClientRepository.class);
        products = mock(ProductRepository.class);
        clientService = mock(ClientService.class);
        productService = mock(ProductService.class);
        when(clients.findImportDocuments()).thenReturn(List.of("12.345/0001-00"));
        when(products.findImportSkus()).thenReturn(List.of("EXISTENTE"));
        service = new CatalogImportService(clients, products, clientService, productService, Validation.buildDefaultValidatorFactory().getValidator());
    }

    @Test void previewClassifiesBeforeDeduplicationAndDoesNotWrite() {
        var preview = service.preview("products", csv("sku;nome;garantia_meses\nA;;12\na;Produto;12\nA;Outro;12\nexistente;Produto;12\nB;Produto;0\n;;\n"));
        assertEquals(1, preview.validRows());
        assertEquals(2, preview.invalidRows());
        assertEquals(2, preview.duplicateRows());
        assertEquals(1, preview.blankRows());
        assertEquals("name", preview.rows().get(0).reasons().get(0).field());
        assertEquals("Produto", preview.rows().get(1).values().get("name"));
        verifyNoInteractions(clientService, productService);
        verify(products, never()).save(any());
    }

    @Test void documentsAreNormalizedAndMissingDocumentWarnsWithoutChangingFormula() {
        var preview = service.preview("clients", csv("razao_social;documento;telefone\nEmpresa;12345000100;\n=Empresa;;+55\nOutra;;\n"));
        assertEquals(1, preview.duplicateRows());
        assertEquals(2, preview.validRows());
        assertEquals("=Empresa", preview.rows().get(1).values().get("legalName"));
        assertEquals(3, preview.rows().get(1).warnings().size());
    }

    @Test void confirmationReanalyzesCurrentDatabaseAndOnlyCreatesValidRows() {
        var file = csv("sku;nome;garantia_meses\nA;Produto;12\nB;Outro;12\nC;;12\n");
        assertEquals(2, service.preview("products", file).validRows());
        when(products.findImportSkus()).thenReturn(List.of("A"));
        var result = service.confirm("products", file);
        assertEquals(1, result.importedRows());
        assertEquals(1, result.ignoredDuplicateRows());
        assertEquals(1, result.ignoredInvalidRows());
        verify(productService).create(argThat(request -> request.sku().equals("B")));
        verify(products).flush();
    }

    @Test void zeroValidRowsAreRejected() {
        var error = assertThrows(CatalogImportException.class, () -> service.confirm("products", csv("sku;nome;garantia_meses\nA;;12")));
        assertEquals("Nenhuma linha válida para importar", error.getMessage());
    }

    @Test void rejectsUnknownRepeatedMissingHeadersAndNonIntegerWarranty() {
        assertThrows(CatalogImportException.class, () -> service.preview("clients", csv("razao_social;errado\nA;B")));
        assertThrows(CatalogImportException.class, () -> service.preview("clients", csv("razao_social;razao_social\nA;B")));
        assertThrows(CatalogImportException.class, () -> service.preview("products", csv("sku;nome\nA;B")));
        assertEquals(1, service.preview("products", csv("sku;nome;garantia_meses\nA;B;1.5")).invalidRows());
    }

    @Test void rejectsUnsafeContentAndLimits() {
        assertEquals(415, assertThrows(CatalogImportException.class, () -> service.preview("clients", new MockMultipartFile("file", "x.xlsx", "text/csv", new byte[]{1}))).status().value());
        assertEquals(415, assertThrows(CatalogImportException.class, () -> service.preview("clients", new MockMultipartFile("file", "x.csv", "text/csv", new byte[]{80,75,3,4}))).status().value());
        assertThrows(CatalogImportException.class, () -> service.preview("clients", csv("razao_social;email\nA;\0")));
        assertEquals(413, assertThrows(CatalogImportException.class, () -> service.preview("clients", new MockMultipartFile("file", "x.csv", "text/plain", new byte[2 * 1024 * 1024 + 1]))).status().value());
    }

    @Test void punctuationOnlyDocumentIsInvalid() {
        var preview = service.preview("clients", csv("razao_social;documento\nEmpresa;.-/"));
        assertEquals(1, preview.invalidRows());
    }

    @Test void rejectsDeclaredNonTextualMimeEvenWithCsvBytes() {
        assertEquals(415, assertThrows(CatalogImportException.class, () -> service.preview("clients", new MockMultipartFile("file", "x.csv", "application/pdf", "razao_social\nEmpresa".getBytes(StandardCharsets.UTF_8)))).status().value());
    }

    private MockMultipartFile csv(String content) {
        return new MockMultipartFile("file", "arquivo.csv", "text/csv", content.getBytes(StandardCharsets.UTF_8));
    }
}
