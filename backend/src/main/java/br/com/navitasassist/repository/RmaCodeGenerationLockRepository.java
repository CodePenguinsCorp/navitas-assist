package br.com.navitasassist.repository;

import java.util.Optional;

import br.com.navitasassist.rma.RmaCodeGenerationLock;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

public interface RmaCodeGenerationLockRepository extends JpaRepository<RmaCodeGenerationLock, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select generationLock from RmaCodeGenerationLock generationLock where generationLock.id = 1")
    Optional<RmaCodeGenerationLock> lockForCodeGeneration();
}
