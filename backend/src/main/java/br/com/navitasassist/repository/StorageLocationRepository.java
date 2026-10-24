package br.com.navitasassist.repository;

import java.util.List;
import java.util.Optional;

import br.com.navitasassist.custody.StorageLocation;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface StorageLocationRepository extends JpaRepository<StorageLocation, Long> {

    boolean existsByCodeIgnoreCase(String code);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select l from StorageLocation l where l.id = :id")
    Optional<StorageLocation> findByIdForUpdate(@Param("id") Long id);

    @Query("select l from StorageLocation l left join fetch l.parent order by l.code asc")
    List<StorageLocation> findAllOrderByCode();
}
