package br.com.navitasassist.repository;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;

import br.com.navitasassist.rma.RmaDashboardQueueItem;
import br.com.navitasassist.rma.RmaDashboardRecentItem;
import br.com.navitasassist.rma.RmaDashboardStatusEvent;
import br.com.navitasassist.rma.RmaPriority;
import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.rma.RmaStatus;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Consultas agregadas e limitadas do dashboard: nenhuma carrega OS completas nem históricos inteiros. */
public interface RmaDashboardRepository extends Repository<RmaRecord, Long> {

    @Query("select r.status, count(r) from RmaRecord r group by r.status")
    List<Object[]> countByStatus();

    @Query("select count(r) from RmaRecord r where r.status in :statuses and r.priority = :priority")
    long countByStatusInAndPriority(@Param("statuses") Collection<RmaStatus> statuses, @Param("priority") RmaPriority priority);

    @Query("select count(r) from RmaRecord r where r.status not in :closed and r.dueDate < :today")
    long countOverdue(@Param("closed") Collection<RmaStatus> closed, @Param("today") LocalDate today);

    @Query("select count(r) from RmaRecord r where r.status not in :closed and r.dueDate >= :today and r.dueDate <= :limit")
    long countDueSoon(@Param("closed") Collection<RmaStatus> closed, @Param("today") LocalDate today, @Param("limit") LocalDate limit);

    /** Por item: compra desconhecida, data de compra, entrada, meses de garantia e ajuste manual. */
    @Query("""
        select r.purchaseDateUnknown, r.purchaseDate, r.entryDate, coalesce(i.warrantyMonths, p.defaultWarrantyMonths), i.warrantyOverride
        from RmaItem i join i.rma r join i.product p
        """)
    List<Object[]> itemWarrantyInputs();

    /** OS antigas sem itens contam como um item com a garantia padrão do produto. */
    @Query("""
        select r.purchaseDateUnknown, r.purchaseDate, r.entryDate, p.defaultWarrantyMonths
        from RmaRecord r join r.product p
        where not exists (select 1 from RmaItem i where i.rma = r)
        """)
    List<Object[]> legacyWarrantyInputs();

    @Query("""
        select new br.com.navitasassist.rma.RmaDashboardQueueItem(r.id, r.code, c.legalName, r.entryDate, r.status, r.priority)
        from RmaRecord r join r.client c
        where r.status not in :closed
        order by case when r.priority = br.com.navitasassist.rma.RmaPriority.HIGH then 0
                      when r.priority = br.com.navitasassist.rma.RmaPriority.MEDIUM then 1 else 2 end,
                 r.entryDate asc, r.id desc
        """)
    List<RmaDashboardQueueItem> findQueue(@Param("closed") Collection<RmaStatus> closed, Pageable pageable);

    @Query("""
        select new br.com.navitasassist.rma.RmaDashboardRecentItem(r.id, r.code, c.legalName, a.fullName, r.updatedAt)
        from RmaRecord r join r.client c left join r.assignee a
        order by r.updatedAt desc, r.entryDate desc, r.id desc
        """)
    List<RmaDashboardRecentItem> findRecent(Pageable pageable);

    @Query("""
        select new br.com.navitasassist.rma.RmaDashboardStatusEvent(r.id, r.code, h.status, h.changedBy, h.note, h.changedAt)
        from RmaStatusHistory h join h.rma r
        order by h.changedAt desc, h.id desc
        """)
    List<RmaDashboardStatusEvent> findRecentStatusEvents(Pageable pageable);
}
