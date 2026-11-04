package br.com.navitasassist.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.time.LocalDate;

import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.rma.RmaStatus;
import br.com.navitasassist.rma.RmaSummaryResponse;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RmaRecordRepository extends JpaRepository<RmaRecord, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from RmaRecord r where r.id = :id")
    Optional<RmaRecord> findByIdForUpdate(@Param("id") Long id);

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

    // Queue order, as the RMA list used before pagination: priority first, then the oldest entry.
    // The filter of this query, its countQuery and summarize() must stay identical.
    @Query(value = """
        select r
        from RmaRecord r
        where (:status is null or r.status = :status)
          and (
            :query is null
            or lower(r.code) like lower(concat('%', :query, '%'))
            or lower(coalesce(r.itemIdentification.batchNumber, '')) like lower(concat('%', :query, '%'))
            or lower(coalesce(r.itemIdentification.serialNumber, '')) like lower(concat('%', :query, '%'))
            or lower(r.client.legalName) like lower(concat('%', :query, '%'))
            or lower(coalesce(r.client.tradeName, '')) like lower(concat('%', :query, '%'))
            or lower(r.product.name) like lower(concat('%', :query, '%'))
            or lower(r.product.sku) like lower(concat('%', :query, '%'))
            or exists (
              select 1
              from RmaItem i
              where i.rma = r
                and (
                  lower(coalesce(i.itemIdentification.batchNumber, '')) like lower(concat('%', :query, '%'))
                  or lower(coalesce(i.itemIdentification.serialNumber, '')) like lower(concat('%', :query, '%'))
                  or lower(i.product.name) like lower(concat('%', :query, '%'))
                  or lower(i.product.sku) like lower(concat('%', :query, '%'))
                )
            )
          )
        order by
          case
            when r.priority = br.com.navitasassist.rma.RmaPriority.HIGH then 0
            when r.priority = br.com.navitasassist.rma.RmaPriority.MEDIUM then 1
            else 2
          end,
          r.entryDate asc,
          r.id asc
        """,
        countQuery = """
        select count(r)
        from RmaRecord r
        where (:status is null or r.status = :status)
          and (
            :query is null
            or lower(r.code) like lower(concat('%', :query, '%'))
            or lower(coalesce(r.itemIdentification.batchNumber, '')) like lower(concat('%', :query, '%'))
            or lower(coalesce(r.itemIdentification.serialNumber, '')) like lower(concat('%', :query, '%'))
            or lower(r.client.legalName) like lower(concat('%', :query, '%'))
            or lower(coalesce(r.client.tradeName, '')) like lower(concat('%', :query, '%'))
            or lower(r.product.name) like lower(concat('%', :query, '%'))
            or lower(r.product.sku) like lower(concat('%', :query, '%'))
            or exists (
              select 1
              from RmaItem i
              where i.rma = r
                and (
                  lower(coalesce(i.itemIdentification.batchNumber, '')) like lower(concat('%', :query, '%'))
                  or lower(coalesce(i.itemIdentification.serialNumber, '')) like lower(concat('%', :query, '%'))
                  or lower(i.product.name) like lower(concat('%', :query, '%'))
                  or lower(i.product.sku) like lower(concat('%', :query, '%'))
                )
            )
          )

        """)
    Page<RmaRecord> searchPage(@Param("query") String query, @Param("status") RmaStatus status, Pageable pageable);

    // Totals for the summary cards over the same filter as searchPage, not only the current page.
    @Query("""
        select new br.com.navitasassist.rma.RmaSummaryResponse(
            count(r),
            coalesce(sum(case when r.status not in :terminalStatuses then 1L else 0L end), 0L),
            coalesce(sum(case when r.priority = br.com.navitasassist.rma.RmaPriority.HIGH then 1L else 0L end), 0L)
        )
        from RmaRecord r
        where (:status is null or r.status = :status)
          and (
            :query is null
            or lower(r.code) like lower(concat('%', :query, '%'))
            or lower(coalesce(r.itemIdentification.batchNumber, '')) like lower(concat('%', :query, '%'))
            or lower(coalesce(r.itemIdentification.serialNumber, '')) like lower(concat('%', :query, '%'))
            or lower(r.client.legalName) like lower(concat('%', :query, '%'))
            or lower(coalesce(r.client.tradeName, '')) like lower(concat('%', :query, '%'))
            or lower(r.product.name) like lower(concat('%', :query, '%'))
            or lower(r.product.sku) like lower(concat('%', :query, '%'))
            or exists (
              select 1
              from RmaItem i
              where i.rma = r
                and (
                  lower(coalesce(i.itemIdentification.batchNumber, '')) like lower(concat('%', :query, '%'))
                  or lower(coalesce(i.itemIdentification.serialNumber, '')) like lower(concat('%', :query, '%'))
                  or lower(i.product.name) like lower(concat('%', :query, '%'))
                  or lower(i.product.sku) like lower(concat('%', :query, '%'))
                )
            )
          )
        """)
    RmaSummaryResponse summarize(@Param("query") String query, @Param("status") RmaStatus status, @Param("terminalStatuses") Collection<RmaStatus> terminalStatuses);

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
