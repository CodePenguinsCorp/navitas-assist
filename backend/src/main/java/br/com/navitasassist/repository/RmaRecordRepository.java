package br.com.navitasassist.repository;

import java.util.List;
import java.util.Optional;
import java.time.LocalDate;

import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.rma.RmaStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RmaRecordRepository extends JpaRepository<RmaRecord, Long> {

    boolean existsByProduct_Id(Long productId);

    boolean existsByItems_Product_Id(Long productId);

    boolean existsByClient_Id(Long clientId);

    boolean existsByAssignee_Id(Long assigneeId);

    Optional<RmaRecord> findByCodeIgnoreCase(String code);

    Optional<RmaRecord> findTopByCodeStartingWithOrderByCodeDesc(String prefix);

    // Report rows with their to-one relations; collections are loaded by the fetch* queries below for the same RMAs.
    @Query("""
        select r from RmaRecord r
        join fetch r.client
        join fetch r.product
        left join fetch r.assignee
        left join fetch r.diagnosis
        where r.entryDate >= :entryFrom
          and r.entryDate <= :entryTo
          and (:status is null or r.status = :status)
          and (:clientId is null or r.client.id = :clientId)
        order by r.entryDate desc, r.id desc
        """)
    List<RmaRecord> searchReport(@Param("entryFrom") LocalDate entryFrom, @Param("entryTo") LocalDate entryTo,
        @Param("status") RmaStatus status, @Param("clientId") Long clientId);

    @Query("select distinct r from RmaRecord r left join fetch r.items i left join fetch i.product where r in :rmas")
    List<RmaRecord> fetchItemsWithProducts(@Param("rmas") List<RmaRecord> rmas);

    @Query("select distinct r from RmaRecord r left join fetch r.statusHistory where r in :rmas")
    List<RmaRecord> fetchStatusHistory(@Param("rmas") List<RmaRecord> rmas);

    @Query("select distinct r from RmaRecord r left join fetch r.assignmentHistory where r in :rmas")
    List<RmaRecord> fetchAssignmentHistory(@Param("rmas") List<RmaRecord> rmas);

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
    List<RmaRecord> search(@Param("query") String query, @Param("status") RmaStatus status);

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
