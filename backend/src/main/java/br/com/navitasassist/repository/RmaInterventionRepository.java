package br.com.navitasassist.repository;

import br.com.navitasassist.rma.RmaIntervention;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface RmaInterventionRepository extends JpaRepository<RmaIntervention, Long> {
    List<RmaIntervention> findByRma_IdOrderByIdAsc(Long rmaId);

    @Query("select trim(i.type) from RmaIntervention i where trim(coalesce(i.type, '')) <> '' group by trim(i.type) order by min(i.id)")
    List<String> findDistinctTypes();
}
