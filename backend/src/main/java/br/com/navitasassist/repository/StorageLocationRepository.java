package br.com.navitasassist.repository;

import java.util.List;

import br.com.navitasassist.custody.StorageLocation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface StorageLocationRepository extends JpaRepository<StorageLocation, Long> {

    boolean existsByCodeIgnoreCase(String code);

    @Query("select l from StorageLocation l left join fetch l.parent order by l.code asc")
    List<StorageLocation> findAllOrderByCode();
}
