package br.com.navitasassist.repository;

import java.util.Collection;
import java.util.List;

import br.com.navitasassist.rma.RmaBlockPoint;
import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.rma.RmaStatusPoint;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Consultas em lote do Kanban: uma por tipo de dado para todas as OS, sem carregar históricos nem notas. */
public interface RmaBoardRepository extends Repository<RmaRecord, Long> {

    @Query("""
        select new br.com.navitasassist.rma.RmaStatusPoint(h.rma.id, h.status, h.changedAt, h.id)
        from RmaStatusHistory h
        where h.rma.id in :ids and h.changedAt is not null and h.status is not null
        order by h.rma.id, h.changedAt, h.id
        """)
    List<RmaStatusPoint> findStatusPoints(@Param("ids") Collection<Long> ids);

    @Query("""
        select new br.com.navitasassist.rma.RmaBlockPoint(b.rma.id, min(b.blockedAt))
        from RmaBlock b
        where b.resolvedAt is null and b.rma.id in :ids
        group by b.rma.id
        """)
    List<RmaBlockPoint> findOpenBlocks(@Param("ids") Collection<Long> ids);
}
