package br.com.navitasassist.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import br.com.navitasassist.notification.Notification;
import br.com.navitasassist.notification.NotificationEmailStatus;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

    @EntityGraph(attributePaths = { "rma" })
    @Query("""
        select n
        from Notification n
        where n.recipient.id = :recipientId
          and (:unreadOnly = false or n.readAt is null)
          and (:includeSnoozed = true or n.snoozedUntil is null or n.snoozedUntil <= :now)
        order by n.createdAt desc, n.id desc
        """)
    List<Notification> findForRecipient(
        @Param("recipientId") Long recipientId,
        @Param("unreadOnly") boolean unreadOnly,
        @Param("includeSnoozed") boolean includeSnoozed,
        @Param("now") Instant now,
        Pageable pageable
    );

    @Query("""
        select n.eventType, count(n)
        from Notification n
        where n.recipient.id = :recipientId
          and n.readAt is null
          and (n.snoozedUntil is null or n.snoozedUntil <= :now)
        group by n.eventType
        """)
    List<Object[]> countUnreadByType(@Param("recipientId") Long recipientId, @Param("now") Instant now);

    @EntityGraph(attributePaths = { "rma" })
    Optional<Notification> findByIdAndRecipient_Id(Long id, Long recipientId);

    @Modifying
    @Query("update Notification n set n.readAt = :now where n.recipient.id = :recipientId and n.readAt is null")
    int markAllRead(@Param("recipientId") Long recipientId, @Param("now") Instant now);

    @EntityGraph(attributePaths = { "rma", "recipient", "event" })
    List<Notification> findByEmailStatusOrderByCreatedAtDesc(NotificationEmailStatus status, Pageable pageable);

    @EntityGraph(attributePaths = { "rma", "recipient" })
    List<Notification> findByIdIn(List<Long> ids);
}
