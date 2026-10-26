package br.com.navitasassist.repository;

import java.util.Optional;
import br.com.navitasassist.kanban.WipLimit;
import br.com.navitasassist.rma.RmaStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface WipLimitRepository extends JpaRepository<WipLimit, RmaStatus> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select w from WipLimit w where w.status = :status")
    Optional<WipLimit> findByStatusForUpdate(@Param("status") RmaStatus status);
}
