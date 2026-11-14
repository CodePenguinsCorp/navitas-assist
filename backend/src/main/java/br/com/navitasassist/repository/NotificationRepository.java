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

    @Query("select n.id from Notification n where n.emailStatus = br.com.navitasassist.notification.NotificationEmailStatus.PENDING and n.emailNextAttemptAt <= :now order by n.emailNextAttemptAt, n.id")
    List<Long> findDueEmailIds(@Param("now") Instant now, Pageable pageable);

    /** Entregas aceitas pelo provedor real (o fake não conta) no intervalo [from, to). */
    @Query("""
        select count(n) from Notification n
        where n.emailStatus = br.com.navitasassist.notification.NotificationEmailStatus.SENT
          and n.emailProvider <> 'fake'
          and n.emailSentAt >= :from and n.emailSentAt < :to
        """)
    long countRealEmailsSentBetween(@Param("from") Instant from, @Param("to") Instant to);

    /**
     * Reserva a tentativa: só uma instância encontra a linha ainda devida com a tentativa esperada; as demais afetam 0 linhas.
     * A próxima tentativa vai para {@code leaseUntil}, e a conclusão (ou o recuo) a substitui.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
        update Notification n set n.emailAttempts = n.emailAttempts + 1, n.emailNextAttemptAt = :leaseUntil, n.emailProvider = :provider
        where n.id = :id
          and n.emailStatus = br.com.navitasassist.notification.NotificationEmailStatus.PENDING
          and n.emailAttempts = :attempts
          and n.emailGeneration = :generation
          and n.emailNextAttemptAt <= :now
        """)
    int claimEmail(@Param("id") Long id, @Param("attempts") int attempts, @Param("generation") int generation, @Param("now") Instant now,
        @Param("leaseUntil") Instant leaseUntil, @Param("provider") String provider);

    /** Registra o resultado de um erro de processamento só se a linha ainda estiver PENDING na tentativa esperada. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
        update Notification n set n.emailStatus = :status, n.emailAttempts = :nextAttempts, n.emailNextAttemptAt = :nextAttemptAt, n.emailError = :error
        where n.id = :id
          and n.emailStatus = br.com.navitasassist.notification.NotificationEmailStatus.PENDING
          and n.emailAttempts = :attempts
        """)
    int deferEmail(@Param("id") Long id, @Param("attempts") int attempts, @Param("nextAttempts") int nextAttempts,
        @Param("status") NotificationEmailStatus status, @Param("nextAttemptAt") Instant nextAttemptAt, @Param("error") String error);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Notification n set n.emailStatus = br.com.navitasassist.notification.NotificationEmailStatus.PENDING, n.emailAttempts = 0, n.emailGeneration = n.emailGeneration + 1, n.emailError = null, n.emailNextAttemptAt = :now where n.id = :id and n.emailStatus = br.com.navitasassist.notification.NotificationEmailStatus.FAILED")
    int retryFailedEmail(@Param("id") Long id, @Param("now") Instant now);

    @EntityGraph(attributePaths = { "rma" })
    @Query("""
        select n
        from Notification n
        where n.recipient.id = :recipientId
          and n.appVisible = true
          and n.eventType in :visibleTypes
          and (:eventType is null or n.eventType = :eventType)
          and (:severity is null or n.severity = :severity)
          and (:unreadOnly = false or n.readAt is null)
          and (:includeSnoozed = true or n.snoozedUntil is null or n.snoozedUntil <= :now)
        order by n.createdAt desc, n.id desc
        """)
    List<Notification> findForRecipient(
        @Param("recipientId") Long recipientId,
        @Param("unreadOnly") boolean unreadOnly,
        @Param("includeSnoozed") boolean includeSnoozed,
        @Param("now") Instant now,
        @Param("visibleTypes") java.util.Collection<br.com.navitasassist.notification.NotificationEventType> visibleTypes,
        @Param("eventType") br.com.navitasassist.notification.NotificationEventType eventType,
        @Param("severity") br.com.navitasassist.notification.NotificationSeverity severity,
        Pageable pageable
    );

    @Query("""
        select n.eventType, count(n)
        from Notification n
        where n.recipient.id = :recipientId
          and n.appVisible = true
          and n.readAt is null
          and (n.snoozedUntil is null or n.snoozedUntil <= :now)
        group by n.eventType
        """)
    List<Object[]> countUnreadByType(@Param("recipientId") Long recipientId, @Param("now") Instant now);

    @EntityGraph(attributePaths = { "rma" })
    Optional<Notification> findByIdAndRecipient_Id(Long id, Long recipientId);

    @Modifying
    @Query("update Notification n set n.readAt = :now where n.recipient.id = :recipientId and n.appVisible = true and n.eventType in :visibleTypes and n.readAt is null")
    int markAllRead(@Param("recipientId") Long recipientId, @Param("now") Instant now, @Param("visibleTypes") java.util.Collection<br.com.navitasassist.notification.NotificationEventType> visibleTypes);

    @EntityGraph(attributePaths = { "rma", "recipient", "event" })
    List<Notification> findByEmailStatusOrderByCreatedAtDesc(NotificationEmailStatus status, Pageable pageable);
}
