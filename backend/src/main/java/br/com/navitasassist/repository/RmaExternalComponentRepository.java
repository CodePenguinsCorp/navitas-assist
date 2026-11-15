package br.com.navitasassist.repository;

import br.com.navitasassist.rma.RmaExternalComponent;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface RmaExternalComponentRepository extends JpaRepository<RmaExternalComponent, Long> {
    List<RmaExternalComponent> findByRma_IdOrderByIdAsc(Long rmaId);

    @Query("select trim(c.unit) from RmaExternalComponent c where trim(coalesce(c.unit, '')) <> '' group by trim(c.unit) order by min(c.id)")
    List<String> findDistinctUnits();
}
