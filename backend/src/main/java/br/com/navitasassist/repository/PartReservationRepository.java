package br.com.navitasassist.repository;

import java.util.List;
import java.util.Optional;

import br.com.navitasassist.part.PartReservation;
import br.com.navitasassist.part.PartReservationStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PartReservationRepository extends JpaRepository<PartReservation, Long> {

    @EntityGraph(attributePaths = { "part", "rma" })
    List<PartReservation> findByRma_IdOrderByIdAsc(Long rmaId);

    @EntityGraph(attributePaths = { "part", "rma" })
    List<PartReservation> findByStatusOrderByIdAsc(PartReservationStatus status);

    @Query("select r.part.id from PartReservation r where r.id = :id and r.rma.id = :rmaId")
    Optional<Long> findPartIdByIdAndRmaId(@Param("id") Long id, @Param("rmaId") Long rmaId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from PartReservation r where r.id = :id")
    Optional<PartReservation> findByIdForUpdate(@Param("id") Long id);
}
