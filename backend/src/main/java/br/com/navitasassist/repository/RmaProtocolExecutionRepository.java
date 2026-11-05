package br.com.navitasassist.repository;

import java.util.List;
import java.util.Optional;

import br.com.navitasassist.protocol.ProtocolExecutionStatus;
import br.com.navitasassist.protocol.RmaProtocolExecution;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RmaProtocolExecutionRepository extends JpaRepository<RmaProtocolExecution, Long> {

    List<RmaProtocolExecution> findAllByRma_IdOrderByIdAsc(Long rmaId);

    boolean existsByRma_IdAndTemplateVersion_Template_IdAndStatus(Long rmaId, Long templateId, ProtocolExecutionStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select e from RmaProtocolExecution e where e.id = :id")
    Optional<RmaProtocolExecution> findByIdForUpdate(@Param("id") Long id);
}
