package br.com.navitasassist.repository;

import java.util.List;
import java.util.Optional;

import br.com.navitasassist.protocol.ProtocolTemplate;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProtocolTemplateRepository extends JpaRepository<ProtocolTemplate, Long> {

    @Query("select t from ProtocolTemplate t left join fetch t.product order by lower(t.name) asc, t.id asc")
    List<ProtocolTemplate> findAllOrderByName();

    @Query("select t from ProtocolTemplate t left join fetch t.product where t.active = true")
    List<ProtocolTemplate> findAllActive();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from ProtocolTemplate t where t.id = :id")
    Optional<ProtocolTemplate> findByIdForUpdate(@Param("id") Long id);
}
