package br.com.navitasassist.repository;

import java.util.List;
import java.util.Optional;

import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.rma.RmaStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RmaRecordRepository extends JpaRepository<RmaRecord, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from RmaRecord r where r.id = :id")
    Optional<RmaRecord> findByIdForUpdate(@Param("id") Long id);

    boolean existsByStatus(String status);

    boolean existsByProduct_Id(Long productId);

    boolean existsByItems_Product_Id(Long productId);

    boolean existsByClient_Id(Long clientId);

    boolean existsByAssignee_Id(Long assigneeId);

    Optional<RmaRecord> findByCodeIgnoreCase(String code);

    Optional<RmaRecord> findTopByCodeStartingWithOrderByCodeDesc(String prefix);

    @Query("""
        select distinct r
        from RmaRecord r
        join r.client c
        join r.product p
        left join r.items i
        left join i.product ip
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
            or lower(coalesce(i.itemIdentification.batchNumber, '')) like lower(concat('%', :query, '%'))
            or lower(coalesce(i.itemIdentification.serialNumber, '')) like lower(concat('%', :query, '%'))
            or lower(coalesce(ip.name, '')) like lower(concat('%', :query, '%'))
            or lower(coalesce(ip.sku, '')) like lower(concat('%', :query, '%'))
          )
        order by r.entryDate desc, r.id desc
        """)
    List<RmaRecord> search(@Param("query") String query, @Param("status") String status);

    @Query("""
        select distinct r
        from RmaRecord r
        left join r.items i
        where (:batchNumber is not null and lower(i.itemIdentification.batchNumber) = lower(:batchNumber))
           or (:serialNumber is not null and lower(i.itemIdentification.serialNumber) = lower(:serialNumber))
           or (:batchNumber is not null and lower(r.itemIdentification.batchNumber) = lower(:batchNumber))
           or (:serialNumber is not null and lower(r.itemIdentification.serialNumber) = lower(:serialNumber))
        order by r.entryDate desc, r.id desc
        """)
    List<RmaRecord> findHistory(
        @Param("batchNumber") String batchNumber,
        @Param("serialNumber") String serialNumber
    );
}
