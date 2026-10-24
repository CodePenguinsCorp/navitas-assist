package br.com.navitasassist.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import br.com.navitasassist.custody.RmaCustodyMovement;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RmaCustodyMovementRepository extends JpaRepository<RmaCustodyMovement, Long> {

    List<RmaCustodyMovement> findAllByRma_IdOrderByPerformedAtDescIdDesc(Long rmaId);

    Optional<RmaCustodyMovement> findTopByRma_IdOrderByIdDesc(Long rmaId);

    @Query("""
        select m
        from RmaCustodyMovement m
        left join fetch m.toLocation
        where m.id in (select max(latest.id) from RmaCustodyMovement latest group by latest.rma.id)
        """)
    List<RmaCustodyMovement> findLatestPerRma();

    @Query("""
        select count(m) > 0
        from RmaCustodyMovement m
        where m.toLocation.id in :locationIds
          and m.id in (select max(latest.id) from RmaCustodyMovement latest group by latest.rma.id)
        """)
    boolean isAnyLocationOccupied(@Param("locationIds") Collection<Long> locationIds);
}
