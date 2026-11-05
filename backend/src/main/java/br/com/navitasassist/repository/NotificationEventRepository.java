package br.com.navitasassist.repository;

import java.util.List;

import br.com.navitasassist.notification.NotificationEvent;
import br.com.navitasassist.notification.NotificationEventStatus;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NotificationEventRepository extends JpaRepository<NotificationEvent, Long> {

    boolean existsByEventKey(String eventKey);

    @EntityGraph(attributePaths = { "rma" })
    List<NotificationEvent> findByStatusOrderByOccurredAtDesc(NotificationEventStatus status, Pageable pageable);
}
