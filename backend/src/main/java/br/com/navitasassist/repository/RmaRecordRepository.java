package br.com.navitasassist.repository;

import java.util.List;
import java.util.Optional;

import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.rma.RmaStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RmaRecordRepository extends JpaRepository<RmaRecord, Long> {

    Optional<RmaRecord> findByCodeIgnoreCase(String code);

    Optional<RmaRecord> findTopByCodeStartingWithOrderByCodeDesc(String prefix);

    @Query("""
        select distinct r
        from RmaRecord r
        join r.client c
        join r.product p
        where (:status is null or r.status = :status)
          and (
            :query is null
            or lower(r.code) like lower(concat('%', :query, '%'))
            or lower(coalesce(r.itemIdentification.batchNumber, '')) like lower(concat('%', :query, '%'))
            or lower(coalesce(r.itemIdentification.serialNumber, '')) like lower(concat('%', :query, '%'))
            or lower(c.legalName) like lower(concat('%', :query, '%'))
            or lower(coalesce(c.tradeName, '')) like lower(concat('%', :query, '%'))
            or lower(p.name) like lower(concat('%', :query, '%'))
            or lower(p.sku) like lower(concat('%', :query, '%'))
          )
        order by r.entryDate desc, r.id desc
        """)
    List<RmaRecord> search(@Param("query") String query, @Param("status") RmaStatus status);

    @Query("""
        select r
        from RmaRecord r
        where (:batchNumber is not null and lower(r.itemIdentification.batchNumber) = lower(:batchNumber))
           or (:serialNumber is not null and lower(r.itemIdentification.serialNumber) = lower(:serialNumber))
        order by r.entryDate desc, r.id desc
        """)
    List<RmaRecord> findHistory(
        @Param("batchNumber") String batchNumber,
        @Param("serialNumber") String serialNumber
    );
}
