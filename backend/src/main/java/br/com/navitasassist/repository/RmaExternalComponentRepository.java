package br.com.navitasassist.repository;

import br.com.navitasassist.rma.RmaExternalComponent;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RmaExternalComponentRepository extends JpaRepository<RmaExternalComponent, Long> {
    List<RmaExternalComponent> findByRma_IdOrderByIdAsc(Long rmaId);
}
