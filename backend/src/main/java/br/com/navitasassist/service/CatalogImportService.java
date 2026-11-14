package br.com.navitasassist.service;

import br.com.navitasassist.catalogimport.*;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.ProductRepository;
import jakarta.validation.Validator;
import jakarta.validation.ConstraintViolation;
import br.com.navitasassist.client.ClientRequest;
import br.com.navitasassist.product.ProductRequest;
import br.com.navitasassist.catalogimport.ImportPreviewResponse.Issue;
import br.com.navitasassist.catalogimport.ImportPreviewResponse.Row;
import java.io.IOException;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@RequiredArgsConstructor
public class CatalogImportService {
    private final AuditService audit;
    private final ClientRepository clients;
    private final ProductRepository products;
    private final ClientService clientService;
    private final ProductService productService;
    private final Validator validator;
    private static final int MAX_BYTES = 2 * 1024 * 1024;
    private static final List<String> CLIENT_HEADERS = List.of("razao_social", "nome_fantasia", "documento", "email", "telefone", "endereco", "observacoes");
    private static final List<String> CLIENT_FIELDS = List.of("legalName", "tradeName", "documentNumber", "email", "phone", "address", "notes");
    private static final List<String> PRODUCT_HEADERS = List.of("sku", "nome", "categoria", "versao_hardware", "versao_firmware", "garantia_meses", "notas_tecnicas");
    private static final List<String> PRODUCT_FIELDS = List.of("sku", "name", "category", "hardwareVersion", "firmwareVersion", "defaultWarrantyMonths", "technicalNotes");

    @Transactional(readOnly = true)
    public ImportPreviewResponse preview(String resource, MultipartFile file) {
        boolean isClient = isClient(resource);
        CsvImportParser.ParsedCsv parsed;
        try {
            parsed = CsvImportParser.parse(readFile(file));
        } catch (CsvImportParser.CsvImportException exception) {
            boolean limit = exception.getMessage().contains("excede");
            throw new CatalogImportException(limit ? HttpStatus.PAYLOAD_TOO_LARGE : HttpStatus.BAD_REQUEST, exception.getMessage());
        }
        List<String> allowedHeaders = isClient ? CLIENT_HEADERS : PRODUCT_HEADERS;
        List<String> fields = isClient ? CLIENT_FIELDS : PRODUCT_FIELDS;
        validateHeader(parsed.header(), allowedHeaders, isClient ? List.of("razao_social") : List.of("sku", "nome", "garantia_meses"));
        Set<String> existing = new HashSet<>();
        for (String key : isClient ? clients.findImportDocuments() : products.findImportSkus()) existing.add(normalize(key, isClient));
        Map<String, Integer> firstLines = new HashMap<>();
        List<Row> rows = new ArrayList<>();
        int blanks = parsed.blankRows();
        for (var raw : parsed.rows()) {
            if (raw.fields().stream().allMatch(String::isBlank)) { blanks++; continue; }
            Map<String, Object> values = new LinkedHashMap<>();
            fields.forEach(field -> values.put(field, null));
            List<Issue> reasons = new ArrayList<>();
            List<Issue> warnings = new ArrayList<>();
            if (raw.fields().size() != parsed.header().size()) reasons.add(new Issue("", "COLUMN_COUNT", "Quantidade de campos diferente do cabeçalho"));
            for (int i = 0; i < Math.min(raw.fields().size(), parsed.header().size()); i++) {
                String field = fields.get(allowedHeaders.indexOf(parsed.header().get(i)));
                String value = raw.fields().get(i).trim();
                values.put(field, value.isEmpty() ? null : value);
                if (formula(value)) warnings.add(new Issue(field, "FORMULA", "Texto pode ser interpretado como fórmula em planilhas"));
            }
            if (!isClient) {
                Object warranty = values.get("defaultWarrantyMonths");
                Integer months = null;
                if (warranty != null) {
                    try {
                        if (!warranty.toString().matches("[0-9]+")) throw new NumberFormatException();
                        months = Integer.valueOf(warranty.toString());
                    } catch (NumberFormatException exception) {
                        reasons.add(new Issue("defaultWarrantyMonths", "INTEGER", "Garantia deve ser um número inteiro entre 1 e 2147483647"));
                    }
                }
                values.put("defaultWarrantyMonths", months);
            }
            Object request = isClient ? clientRequest(values) : productRequest(values);
            validator.validate(request).stream().sorted(Comparator.comparing(v -> v.getPropertyPath().toString())).forEach(v -> {
                String field = v.getPropertyPath().toString();
                if (reasons.stream().noneMatch(reason -> reason.field().equals(field))) reasons.add(violation(v));
            });
            String key = normalize((String) values.get(isClient ? "documentNumber" : "sku"), isClient);
            if (isClient && key.isEmpty()) {
                if (values.get("documentNumber") != null) reasons.add(new Issue("documentNumber", "DOCUMENT", "Documento deve conter caracteres além da máscara"));
                else warnings.add(new Issue("documentNumber", "NO_DOCUMENT", "Sem documento: não é possível detectar duplicados; reimportar poderá criar outro cliente"));
            }
            String status = "INVALID";
            if (reasons.isEmpty()) {
                status = "VALID";
                if (!key.isEmpty()) {
                    if (existing.contains(key)) {
                        status = "DUPLICATE";
                        reasons.add(new Issue(isClient ? "documentNumber" : "sku", "DUPLICATE_DATABASE", "Cadastro já existente no banco"));
                    } else if (firstLines.containsKey(key)) {
                        status = "DUPLICATE";
                        reasons.add(new Issue(isClient ? "documentNumber" : "sku", "DUPLICATE_FILE", "Repetido no arquivo; primeira ocorrência na linha " + firstLines.get(key)));
                    } else firstLines.put(key, raw.lineNumber());
                }
            }
            rows.add(new Row(raw.lineNumber(), status, Collections.unmodifiableMap(values), List.copyOf(reasons), List.copyOf(warnings)));
        }
        int valid = (int) rows.stream().filter(row -> row.status().equals("VALID")).count();
        int invalid = (int) rows.stream().filter(row -> row.status().equals("INVALID")).count();
        return new ImportPreviewResponse(safeFileName(file.getOriginalFilename()), String.valueOf(parsed.delimiter()), rows.size(), valid, invalid, rows.size() - valid - invalid, blanks, List.copyOf(rows));
    }

    @Transactional
    public ImportResultResponse confirm(String resource, MultipartFile file) {
        ImportPreviewResponse preview = preview(resource, file);
        if (preview.validRows() == 0) throw new CatalogImportException(HttpStatus.BAD_REQUEST, "Nenhuma linha válida para importar");
        boolean isClient = isClient(resource);
        for (Row row : preview.rows()) {
            if (!row.status().equals("VALID")) continue;
            if (isClient) clientService.create(clientRequest(row.values()));
            else productService.create(productRequest(row.values()));
        }
        if (isClient) clients.flush(); else products.flush();
        audit.record("CSV_IMPORT", "CATALOG_IMPORT", null, isClient ? "Clientes" : "Produtos", "Importação confirmada: " + preview.validRows() + " importados, " + preview.invalidRows() + " inválidos, " + preview.duplicateRows() + " duplicados.");
        return new ImportResultResponse(preview.validRows(), preview.invalidRows(), preview.duplicateRows());
    }

    private boolean isClient(String resource) {
        if (!resource.equals("clients") && !resource.equals("products")) throw new CatalogImportException(HttpStatus.BAD_REQUEST, "Tipo de cadastro inválido");
        return resource.equals("clients");
    }

    private byte[] readFile(MultipartFile file) {
        if (file == null || file.isEmpty()) throw new CatalogImportException(HttpStatus.BAD_REQUEST, "Selecione um arquivo CSV");
        if (file.getOriginalFilename() == null || !file.getOriginalFilename().toLowerCase(Locale.ROOT).endsWith(".csv")) throw new CatalogImportException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Envie um arquivo CSV");
        String mime = file.getContentType() == null ? "" : file.getContentType().toLowerCase(Locale.ROOT).split(";", 2)[0].trim();
        if (!mime.isEmpty() && !mime.startsWith("text/") && !Set.of("application/csv", "application/vnd.ms-excel", "application/octet-stream").contains(mime)) throw new CatalogImportException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Envie um arquivo CSV textual");
        if (file.getSize() > MAX_BYTES) throw new CatalogImportException(HttpStatus.PAYLOAD_TOO_LARGE, "O arquivo excede 2 MiB");
        try (var input = file.getInputStream()) {
            byte[] bytes = input.readNBytes(MAX_BYTES + 1);
            if (bytes.length > MAX_BYTES) throw new CatalogImportException(HttpStatus.PAYLOAD_TOO_LARGE, "O arquivo excede 2 MiB");
            if (bytes.length >= 2 && bytes[0] == 'P' && bytes[1] == 'K' || bytes.length >= 4 && bytes[0] == (byte) 0xd0 && bytes[1] == (byte) 0xcf && bytes[2] == 0x11 && bytes[3] == (byte) 0xe0) throw new CatalogImportException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Envie um arquivo CSV textual");
            return bytes;
        } catch (IOException exception) {
            throw new CatalogImportException(HttpStatus.BAD_REQUEST, "Não foi possível ler o arquivo CSV");
        }
    }

    private void validateHeader(List<String> header, List<String> allowed, List<String> required) {
        if (new HashSet<>(header).size() != header.size()) throw new CatalogImportException(HttpStatus.BAD_REQUEST, "Cabeçalho contém colunas repetidas");
        if (!allowed.containsAll(header)) throw new CatalogImportException(HttpStatus.BAD_REQUEST, "Cabeçalho contém coluna desconhecida");
        for (String field : required) if (!header.contains(field)) throw new CatalogImportException(HttpStatus.BAD_REQUEST, "Cabeçalho obrigatório ausente: " + field);
    }

    private String normalize(String key, boolean document) {
        if (key == null) return "";
        return (document ? key.replaceAll("[./\\-\\s]", "") : key.trim()).toLowerCase(Locale.ROOT);
    }

    private boolean formula(String value) {
        int index = 0;
        while (index < value.length() && (Character.isWhitespace(value.charAt(index)) || Character.isISOControl(value.charAt(index)))) index++;
        return index < value.length() && "=+-@".indexOf(value.charAt(index)) >= 0;
    }

    private Issue violation(ConstraintViolation<?> violation) {
        String code = violation.getConstraintDescriptor().getAnnotation().annotationType().getSimpleName();
        String message = switch (code) {
            case "NotBlank", "NotNull" -> "Campo obrigatório";
            case "Email" -> "E-mail inválido";
            case "Min" -> "Valor deve ser maior ou igual a 1";
            case "Size" -> "Campo excede o limite de " + violation.getConstraintDescriptor().getAttributes().get("max") + " caracteres";
            case "Pattern" -> "Razão social deve conter no máximo 120 caracteres, desconsiderando espaços e traços";
            default -> "Valor inválido";
        };
        return new Issue(violation.getPropertyPath().toString(), code.toUpperCase(Locale.ROOT), message);
    }

    private ClientRequest clientRequest(Map<String, Object> v) {
        return new ClientRequest((String) v.get("legalName"), (String) v.get("tradeName"), (String) v.get("documentNumber"), (String) v.get("email"), (String) v.get("phone"), (String) v.get("address"), (String) v.get("notes"));
    }

    private ProductRequest productRequest(Map<String, Object> v) {
        return new ProductRequest((String) v.get("sku"), (String) v.get("name"), (String) v.get("category"), (String) v.get("hardwareVersion"), (String) v.get("firmwareVersion"), (Integer) v.get("defaultWarrantyMonths"), (String) v.get("technicalNotes"));
    }

    private String safeFileName(String name) {
        String normalized = name == null ? "arquivo.csv" : name.replace('\\', '/');
        return normalized.substring(normalized.lastIndexOf('/') + 1).replaceAll("[\\p{Cntrl}]", "");
    }
}
