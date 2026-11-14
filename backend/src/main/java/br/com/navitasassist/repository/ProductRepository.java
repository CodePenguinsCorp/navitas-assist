package br.com.navitasassist.repository;

import java.util.List;

import br.com.navitasassist.product.Product;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProductRepository extends JpaRepository<Product, Long> {

    @Query("select p.sku from Product p")
    List<String> findImportSkus();

    boolean existsBySkuIgnoreCase(String sku);

    @Query("""
        select p
        from Product p
        where (
            :query is null
            or lower(unaccent(p.sku)) like lower(unaccent(concat('%', cast(:query as String), '%')))
            or lower(unaccent(p.name)) like lower(unaccent(concat('%', cast(:query as String), '%')))
            or lower(unaccent(coalesce(p.category, ''))) like lower(unaccent(concat('%', cast(:query as String), '%')))
            or lower(unaccent(coalesce(p.hardwareVersion, ''))) like lower(unaccent(concat('%', cast(:query as String), '%')))
            or lower(unaccent(coalesce(p.firmwareVersion, ''))) like lower(unaccent(concat('%', cast(:query as String), '%')))
          )
          and (:category is null or lower(trim(coalesce(p.category, ''))) = lower(cast(:category as String)))
          and (:hasFirmware is null or (case when trim(coalesce(p.firmwareVersion, '')) <> '' then true else false end) = :hasFirmware)
        order by lower(unaccent(p.name)), p.id
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

    // Grafias distintas na ordem do primeiro cadastro: o serviço junta as que diferem só na caixa e fica com a primeira.
    @Query("select trim(p.category) from Product p where trim(coalesce(p.category, '')) <> '' group by trim(p.category) order by min(p.id)")
    List<String> findDistinctCategories();
}
