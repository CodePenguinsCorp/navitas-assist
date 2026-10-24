package br.com.navitasassist.repository;

import java.util.List;
import java.util.Optional;

import br.com.navitasassist.part.PartMovement;
import br.com.navitasassist.part.PartMovementType;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PartMovementRepository extends JpaRepository<PartMovement, Long> {

    @EntityGraph(attributePaths = { "part", "rma", "reservation", "reversedMovement" })
    List<PartMovement> findByPart_IdOrderByIdDesc(Long partId);

    @EntityGraph(attributePaths = { "part", "rma", "reservation", "reversedMovement" })
    List<PartMovement> findByRma_IdOrderByIdDesc(Long rmaId);

    Optional<PartMovement> findFirstByReservation_IdAndTypeOrderByIdDesc(Long reservationId, PartMovementType type);

    boolean existsByReversedMovement_Id(Long movementId);

    @Query("select m.reversedMovement.id from PartMovement m where m.reversedMovement is not null and m.part.id = :partId")
    List<Long> findReversedMovementIdsByPartId(@Param("partId") Long partId);

    @Query("select m.reversedMovement.id from PartMovement m where m.reversedMovement is not null and m.rma.id = :rmaId")
    List<Long> findReversedMovementIdsByRmaId(@Param("rmaId") Long rmaId);
}
