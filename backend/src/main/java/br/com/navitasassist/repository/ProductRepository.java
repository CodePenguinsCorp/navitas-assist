package br.com.navitasassist.repository;

import java.util.List;

import br.com.navitasassist.product.Product;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProductRepository extends JpaRepository<Product, Long> {

    boolean existsBySkuIgnoreCase(String sku);

    @Query("""
        select p
        from Product p
        where (
            :query is null
            or lower(p.sku) like lower(concat('%', :query, '%'))
            or lower(p.name) like lower(concat('%', :query, '%'))
            or lower(coalesce(p.category, '')) like lower(concat('%', :query, '%'))
            or lower(coalesce(p.hardwareVersion, '')) like lower(concat('%', :query, '%'))
            or lower(coalesce(p.firmwareVersion, '')) like lower(concat('%', :query, '%'))
          )
          and (:category is null or lower(trim(coalesce(p.category, ''))) = lower(:category))
          and (:hasFirmware is null or (case when trim(coalesce(p.firmwareVersion, '')) <> '' then true else false end) = :hasFirmware)
        order by lower(p.name), p.id
        """)
    Page<Product> search(
        @Param("query") String query,
        @Param("category") String category,
        @Param("hasFirmware") Boolean hasFirmware,
        Pageable pageable
    );

    List<Product> findAllByOrderByNameAscIdAsc();

    @Query("select count(p) from Product p where trim(coalesce(p.firmwareVersion, '')) <> ''")
    long countWithFirmware();

    @Query("select coalesce(round(avg(p.defaultWarrantyMonths), 0), 0) from Product p")
    long averageWarrantyMonths();

    @Query("select distinct trim(p.category) from Product p where trim(coalesce(p.category, '')) <> ''")
    List<String> findDistinctCategories();
}
