package br.com.navitasassist.repository;

import java.util.List;
import java.util.Optional;

import br.com.navitasassist.part.Part;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PartRepository extends JpaRepository<Part, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Part p where p.id = :id")
    Optional<Part> findByIdForUpdate(@Param("id") Long id);

    boolean existsByCodeIgnoreCase(String code);

    @Query("""
        select p
        from Part p
        where :query is null
           or lower(p.code) like lower(concat('%', :query, '%'))
           or lower(p.name) like lower(concat('%', :query, '%'))
           or lower(coalesce(p.location, '')) like lower(concat('%', :query, '%'))
        order by p.name asc, p.id asc
        """)
    List<Part> search(@Param("query") String query);
}
