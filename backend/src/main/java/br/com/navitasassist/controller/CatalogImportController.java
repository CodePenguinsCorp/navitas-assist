package br.com.navitasassist.controller;
import br.com.navitasassist.service.CatalogImportService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.multipart.MultipartFile;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import br.com.navitasassist.catalogimport.ImportPreviewResponse;
import br.com.navitasassist.catalogimport.ImportResultResponse;
@RestController
@RequiredArgsConstructor
public class CatalogImportController {
    private final CatalogImportService service;

    @GetMapping({"/api/clients/imports/template", "/api/products/imports/template"})
    public ResponseEntity<byte[]> template(HttpServletRequest request) {
        boolean clients = resource(request).equals("clients");
        String text = clients
            ? "razao_social;nome_fantasia;documento;email;telefone;endereco;observacoes\r\nEmpresa Exemplo Ltda;Empresa Exemplo;12.345.678/0001-90;contato@example.com;11999990000;Rua Exemplo 100;Cadastro demonstrativo\r\n"
            : "sku;nome;categoria;versao_hardware;versao_firmware;garantia_meses;notas_tecnicas\r\nNAV-001;Controlador;Controle;1.0;2.0;12;Modelo demonstrativo\r\n";
        return ResponseEntity.ok().contentType(MediaType.parseMediaType("text/csv;charset=UTF-8"))
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + (clients ? "clientes" : "produtos") + "-modelo.csv\"")
            .body(("\uFEFF" + text).getBytes(StandardCharsets.UTF_8));
    }

    @PostMapping(value = {"/api/clients/imports/preview", "/api/products/imports/preview"}, consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ImportPreviewResponse preview(HttpServletRequest request, @RequestParam("file") MultipartFile file) {
        return service.preview(resource(request), file);
    }

    @PostMapping(value = {"/api/clients/imports/confirm", "/api/products/imports/confirm"}, consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ImportResultResponse confirm(HttpServletRequest request, @RequestParam("file") MultipartFile file) {
        return service.confirm(resource(request), file);
    }

    private String resource(HttpServletRequest request) {
        return request.getRequestURI().substring(request.getContextPath().length()).startsWith("/api/clients/") ? "clients" : "products";
    }
}
