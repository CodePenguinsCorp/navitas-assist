package br.com.navitasassist.repository;

import br.com.navitasassist.audit.AuditEvent;
import org.springframework.data.repository.Repository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

/** Append-only: no update or deletion API. Writes use EntityManager.persist. */
public interface AuditEventRepository extends Repository<AuditEvent, Long>, JpaSpecificationExecutor<AuditEvent> {}
