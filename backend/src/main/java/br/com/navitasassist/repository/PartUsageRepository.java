package br.com.navitasassist.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import br.com.navitasassist.part.PartUsage;
import br.com.navitasassist.part.PartUsageStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PartUsageRepository extends JpaRepository<PartUsage, Long> {

    @EntityGraph(attributePaths = { "part", "rma" })
    List<PartUsage> findByRma_IdOrderByIdAsc(Long rmaId);

    @EntityGraph(attributePaths = { "part", "rma" })
    List<PartUsage> findByRma_IdInAndStatusOrderByIdAsc(Collection<Long> rmaIds, PartUsageStatus status);

    @Query("select r.part.id from PartUsage r where r.id = :id and r.rma.id = :rmaId")
    Optional<Long> findPartIdByIdAndRmaId(@Param("id") Long id, @Param("rmaId") Long rmaId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from PartUsage r where r.id = :id")
    Optional<PartUsage> findByIdForUpdate(@Param("id") Long id);
}
