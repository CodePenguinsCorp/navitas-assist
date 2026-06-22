package br.com.navitasassist.service;

import java.util.List;

import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.controller.ResourceNotFoundException;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.product.ProductRequest;
import br.com.navitasassist.product.ProductResponse;
import br.com.navitasassist.repository.ProductRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class ProductService {

    private final ProductRepository productRepository;

    @Transactional(readOnly = true)
    public List<ProductResponse> listAll() {
        return productRepository.findAll().stream().map(ProductResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public ProductResponse getById(Long id) {
        return ProductResponse.from(getEntityById(id));
    }

    public ProductResponse create(ProductRequest request) {
        validateSku(null, request.sku());

        Product product = new Product();
        apply(product, request);
        return ProductResponse.from(productRepository.save(product));
    }

    public ProductResponse update(Long id, ProductRequest request) {
        Product product = getEntityById(id);
        validateSku(product, request.sku());

        apply(product, request);
        return ProductResponse.from(productRepository.save(product));
    }

    @Transactional(readOnly = true)
    public Product getEntityById(Long id) {
        return productRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Product not found: " + id));
    }

    private void validateSku(Product existing, String sku) {
        boolean duplicate = productRepository.existsBySkuIgnoreCase(sku)
            && (existing == null || !existing.getSku().equalsIgnoreCase(sku));

        if (duplicate) {
            throw new BusinessException("SKU already registered: " + sku);
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
