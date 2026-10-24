package br.com.navitasassist.repository;

import java.util.List;
import java.util.Optional;

import br.com.navitasassist.notification.NotificationEventType;
import br.com.navitasassist.notification.NotificationRule;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NotificationRuleRepository extends JpaRepository<NotificationRule, Long> {

    Optional<NotificationRule> findByEventType(NotificationEventType eventType);

    List<NotificationRule> findAllByOrderByIdAsc();
}
