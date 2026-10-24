package br.com.navitasassist.repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import br.com.navitasassist.custody.RmaCustodyMovement;
import br.com.navitasassist.custody.RmaCustodyRow;
import br.com.navitasassist.rma.RmaStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RmaCustodyMovementRepository extends JpaRepository<RmaCustodyMovement, Long> {

    List<RmaCustodyMovement> findAllByRma_IdOrderByPerformedAtDescIdDesc(Long rmaId);

    Optional<RmaCustodyMovement> findTopByRma_IdOrderByIdDesc(Long rmaId);

    /**
     * Tracked RMAs (active or still holding a location) with their latest movement, filtered and paged in the database.
     */
    @Query(value = """
        select new br.com.navitasassist.custody.RmaCustodyRow(
            r.id, r.code, r.status, c.legalName, c.tradeName, p.name,
            l.id, l.code, l.name, l.type, m.custodianId, m.custodianName, m.performedAt)
        from RmaRecord r
        join r.client c
        join r.product p
        left join RmaCustodyMovement m on m.rma = r and m.id = (select max(x.id) from RmaCustodyMovement x where x.rma = r)
        left join m.toLocation l
        where (r.status not in :finishedStatuses or l.id is not null)
          and (:anyLocation = true or l.id in :locationIds)
          and ((:includeMissing = true and l.id is null)
            or (:includeStale = true and l.id is not null and m.performedAt < :staleBefore)
            or (:includeOk = true and l.id is not null and m.performedAt >= :staleBefore))
          and (:query is null
            or lower(r.code) like lower(concat('%', :query, '%'))
            or lower(c.legalName) like lower(concat('%', :query, '%'))
            or lower(coalesce(c.tradeName, '')) like lower(concat('%', :query, '%'))
            or lower(p.name) like lower(concat('%', :query, '%'))
            or lower(coalesce(l.name, '')) like lower(concat('%', :query, '%'))
            or lower(coalesce(m.custodianName, '')) like lower(concat('%', :query, '%')))
        order by r.code asc
        """, countQuery = """
        select count(r)
        from RmaRecord r
        join r.client c
        join r.product p
        left join RmaCustodyMovement m on m.rma = r and m.id = (select max(x.id) from RmaCustodyMovement x where x.rma = r)
        left join m.toLocation l
        where (r.status not in :finishedStatuses or l.id is not null)
          and (:anyLocation = true or l.id in :locationIds)
          and ((:includeMissing = true and l.id is null)
            or (:includeStale = true and l.id is not null and m.performedAt < :staleBefore)
            or (:includeOk = true and l.id is not null and m.performedAt >= :staleBefore))
          and (:query is null
            or lower(r.code) like lower(concat('%', :query, '%'))
            or lower(c.legalName) like lower(concat('%', :query, '%'))
            or lower(coalesce(c.tradeName, '')) like lower(concat('%', :query, '%'))
            or lower(p.name) like lower(concat('%', :query, '%'))
            or lower(coalesce(l.name, '')) like lower(concat('%', :query, '%'))
            or lower(coalesce(m.custodianName, '')) like lower(concat('%', :query, '%')))
        """)
    Page<RmaCustodyRow> searchTracked(
        @Param("finishedStatuses") Collection<RmaStatus> finishedStatuses,
        @Param("anyLocation") boolean anyLocation,
        @Param("locationIds") Collection<Long> locationIds,
        @Param("includeMissing") boolean includeMissing,
        @Param("includeStale") boolean includeStale,
        @Param("includeOk") boolean includeOk,
        @Param("staleBefore") Instant staleBefore,
        @Param("query") String query,
        Pageable pageable
    );

    @Query("""
        select count(m) > 0
        from RmaCustodyMovement m
        where m.toLocation.id in :locationIds
          and m.id in (select max(latest.id) from RmaCustodyMovement latest group by latest.rma.id)
        """)
    boolean isAnyLocationOccupied(@Param("locationIds") Collection<Long> locationIds);
}
