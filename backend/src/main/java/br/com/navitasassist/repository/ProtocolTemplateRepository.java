package br.com.navitasassist.repository;

import java.util.List;

import br.com.navitasassist.protocol.ProtocolTemplate;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ProtocolTemplateRepository extends JpaRepository<ProtocolTemplate, Long> {

    @Query("select t from ProtocolTemplate t left join fetch t.product order by lower(t.name) asc, t.id asc")
    List<ProtocolTemplate> findAllOrderByName();
}
