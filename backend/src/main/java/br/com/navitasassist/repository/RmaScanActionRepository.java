package br.com.navitasassist.repository;

import java.util.List;

import br.com.navitasassist.scan.RmaScanAction;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RmaScanActionRepository extends JpaRepository<RmaScanAction, Long> {

    List<RmaScanAction> findByRma_IdOrderByIdAsc(Long rmaId);
}
