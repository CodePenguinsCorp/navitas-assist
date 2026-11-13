package br.com.navitasassist.repository;

import br.com.navitasassist.rma.RmaIntervention;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RmaInterventionRepository extends JpaRepository<RmaIntervention, Long> {
    List<RmaIntervention> findByRma_IdOrderByIdAsc(Long rmaId);
}
