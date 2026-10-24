package br.com.navitasassist.notification;

import java.time.Instant;

import br.com.navitasassist.rma.RmaRecord;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Processing log of an {@link RmaNotificationEvent}; the unique {@code eventKey} is the idempotency guard.
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "notification_events")
public class NotificationEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 160, updatable = false)
    private String eventKey;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40, updatable = false)
    private NotificationEventType eventType;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "rma_id")
    private RmaRecord rma;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private NotificationEventStatus status;

    @Column(nullable = false)
    private int recipientCount;

    @Column(length = 500)
    private String errorMessage;

    @Column(nullable = false, updatable = false)
    private Instant occurredAt;

    private Instant processedAt;
}
