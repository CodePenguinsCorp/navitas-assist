package br.com.navitasassist.service;

import java.util.List;
import java.util.stream.Collectors;

import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.controller.ResourceNotFoundException;
import br.com.navitasassist.pagination.PageParams;
import br.com.navitasassist.pagination.PageResponse;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.product.ProductRequest;
import br.com.navitasassist.product.ProductResponse;
import br.com.navitasassist.product.ProductOptionResponse;
import br.com.navitasassist.product.ProductSummaryResponse;
import br.com.navitasassist.repository.ProductRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class ProductService {
    private final AuditService audit;

    private final ProductRepository productRepository;
    private final RmaRecordRepository rmaRecordRepository;

    @Transactional(readOnly = true)
    public PageResponse<ProductResponse> search(
        String query,
        String category,
        Boolean hasFirmware,
        Integer page,
        Integer size
    ) {
        return PageResponse.from(
            productRepository.search(blankToNull(query), blankToNull(category), hasFirmware, PageParams.of(page, size)),
            ProductResponse::from
        );
    }

    @Transactional(readOnly = true)
    public List<ProductOptionResponse> listOptions() {
        return productRepository.findAllByOrderByNameAscIdAsc().stream().map(ProductOptionResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public ProductSummaryResponse summarize() {
        List<String> categories = productRepository.findDistinctCategories()
            .stream()
            .collect(Collectors.toMap(category -> category.toLowerCase(), category -> category, (first, second) -> first))
            .values()
            .stream()
            .sorted(String.CASE_INSENSITIVE_ORDER)
            .toList();

        return new ProductSummaryResponse(
            productRepository.count(),
            categories
        );
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    public ProductResponse create(ProductRequest request) {
        validateSku(null, request.sku());

        Product product = new Product();
        apply(product, request);
        productRepository.save(product);
        audit.record("CREATE", "PRODUCT", product.getId(), product.getSku() + " · " + product.getName(), "Registro criado.");
        return ProductResponse.from(product);
    }

    public ProductResponse update(Long id, ProductRequest request) {
        Product product = getEntityById(id);
        validateSku(product, request.sku());

        var before = ProductResponse.from(product);
        apply(product, request);
        productRepository.save(product);
        audit.record("UPDATE", "PRODUCT", product.getId(), product.getSku() + " · " + product.getName(), AuditService.changedFields(before, ProductResponse.from(product)));
        return ProductResponse.from(product);
    }

    public void delete(Long id) {
        Product product = getEntityById(id);

        if (rmaRecordRepository.existsByProduct_Id(id) || rmaRecordRepository.existsByItems_Product_Id(id)) {
            throw new BusinessException("Produto não pode ser excluído porque está vinculado a uma OS.");
        }

        productRepository.delete(product);
        audit.record("DELETE", "PRODUCT", id, product.getSku() + " · " + product.getName(), "Registro excluído.");
    }

    @Transactional(readOnly = true)
    public Product getEntityById(Long id) {
        return productRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Product not found: " + id));
    }

    private void validateSku(Product existing, String sku) {
        String normalizedSku = trim(sku);
        boolean duplicate = productRepository.existsBySkuIgnoreCase(normalizedSku)
            && (existing == null || !existing.getSku().equalsIgnoreCase(normalizedSku));

        if (duplicate) {
            throw new BusinessException("SKU already registered: " + normalizedSku);
        }
    }

    private void apply(Product product, ProductRequest request) {
        product.setSku(trim(request.sku()));
        product.setName(trim(request.name()));
        product.setCategory(trim(request.category()));
        product.setHardwareVersion(trim(request.hardwareVersion()));
        product.setFirmwareVersion(trim(request.firmwareVersion()));
        product.setDefaultWarrantyMonths(request.defaultWarrantyMonths());
        product.setTechnicalNotes(trim(request.technicalNotes()));
    }

    private String trim(String value) {
        return value == null ? null : value.trim();
    }
}
