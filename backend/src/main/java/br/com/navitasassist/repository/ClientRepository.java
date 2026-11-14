package br.com.navitasassist.repository;

import java.util.List;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.client.ClientSummaryResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ClientRepository extends JpaRepository<Client, Long> {

    @Query("select c.documentNumber from Client c where c.documentNumber is not null")
    List<String> findImportDocuments();

    @Query("""
        select c
        from Client c
        where (
            :query is null
            or lower(unaccent(c.legalName)) like lower(unaccent(concat('%', cast(:query as String), '%')))
            or lower(unaccent(coalesce(c.tradeName, ''))) like lower(unaccent(concat('%', cast(:query as String), '%')))
            or lower(unaccent(coalesce(c.documentNumber, ''))) like lower(unaccent(concat('%', cast(:query as String), '%')))
            or lower(unaccent(coalesce(c.email, ''))) like lower(unaccent(concat('%', cast(:query as String), '%')))
            or lower(unaccent(coalesce(c.phone, ''))) like lower(unaccent(concat('%', cast(:query as String), '%')))
          )
          and (:hasDocument is null or (case when trim(coalesce(c.documentNumber, '')) <> '' then true else false end) = :hasDocument)
          and (:hasEmail is null or (case when trim(coalesce(c.email, '')) <> '' then true else false end) = :hasEmail)
        order by lower(unaccent(c.legalName)), c.id
        """)
    Page<Client> search(
        @Param("query") String query,
        @Param("hasDocument") Boolean hasDocument,
        @Param("hasEmail") Boolean hasEmail,
        Pageable pageable
    );

    List<Client> findAllByOrderByLegalNameAscIdAsc();

    @Query("""
        select new br.com.navitasassist.client.ClientSummaryResponse(
            count(c),
            coalesce(sum(case when trim(coalesce(c.phone, '')) <> '' then 1L else 0L end), 0L),
            coalesce(sum(case when trim(coalesce(c.documentNumber, '')) <> '' then 1L else 0L end), 0L),
            coalesce(sum(case when trim(coalesce(c.email, '')) <> '' then 1L else 0L end), 0L)
        )
        from Client c
        """)
    ClientSummaryResponse summarize();
}
