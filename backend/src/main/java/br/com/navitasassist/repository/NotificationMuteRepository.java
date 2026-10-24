package br.com.navitasassist.repository;

import java.util.List;
import java.util.Optional;

import br.com.navitasassist.notification.NotificationEventType;
import br.com.navitasassist.notification.NotificationMute;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface NotificationMuteRepository extends JpaRepository<NotificationMute, Long> {

    Optional<NotificationMute> findByUser_IdAndEventType(Long userId, NotificationEventType eventType);

    @Query("select m.eventType from NotificationMute m where m.user.id = :userId")
    List<NotificationEventType> findEventTypesByUserId(@Param("userId") Long userId);

    @Query("select m.user.id from NotificationMute m where m.eventType = :eventType")
    List<Long> findUserIdsByEventType(@Param("eventType") NotificationEventType eventType);
}
