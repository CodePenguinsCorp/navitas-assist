package br.com.navitasassist.repository;

import br.com.navitasassist.product.Product;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductRepository extends JpaRepository<Product, Long> {

    boolean existsBySkuIgnoreCase(String sku);
}
