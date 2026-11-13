package br.com.navitasassist.catalogimport;

import br.com.navitasassist.repository.ProductRepository;
import br.com.navitasassist.service.CatalogImportService;
import br.com.navitasassist.service.ProductService;
import br.com.navitasassist.product.ProductRequest;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@SpringBootTest
@ActiveProfiles("test")
class CatalogImportIntegrationTest {
    @Autowired CatalogImportService imports;
    @Autowired ProductRepository products;
    @SpyBean ProductService productService;

    @AfterEach void cleanup() {
        reset(productService);
        products.findAll().stream().filter(p -> p.getSku().startsWith("CSV-TEST-")).forEach(products::delete);
    }

    @Test void previewDoesNotWriteAndConfirmationRechecksDatabase() {
        var file = csv("sku;nome;garantia_meses\nCSV-TEST-A;Primeiro;12\nCSV-TEST-B;Segundo;12");
        long count = products.count();
        assertEquals(2, imports.preview("products", file).validRows());
        assertEquals(count, products.count());
        productService.create(new ProductRequest("CSV-TEST-A", "Existente", null, null, null, 12, null));
        var result = imports.confirm("products", file);
        assertEquals(1, result.importedRows());
        assertEquals(1, result.ignoredDuplicateRows());
        assertEquals(count + 2, products.count());
    }

    @Test void failureOnLastCreationRollsBackEarlierRows() {
        long count = products.count();
        doAnswer(invocation -> {
            ProductRequest request = invocation.getArgument(0);
            if (request.sku().equals("CSV-TEST-B")) throw new IllegalStateException("falha de teste");
            return invocation.callRealMethod();
        }).when(productService).create(any());
        assertThrows(IllegalStateException.class, () -> imports.confirm("products", csv("sku;nome;garantia_meses\nCSV-TEST-A;Primeiro;12\nCSV-TEST-B;Segundo;12")));
        assertEquals(count, products.count());
        assertFalse(products.existsBySkuIgnoreCase("CSV-TEST-A"));
    }

    private MockMultipartFile csv(String content) {
        return new MockMultipartFile("file", "dados.csv", "text/csv", content.getBytes(StandardCharsets.UTF_8));
    }
}
