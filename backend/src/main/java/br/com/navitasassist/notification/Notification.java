package br.com.navitasassist.notification;

import java.time.Instant;

import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.user.UserAccount;
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

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "notifications")
public class Notification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "event_id", nullable = false, updatable = false)
    private NotificationEvent event;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "recipient_id", nullable = false, updatable = false)
    private UserAccount recipient;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "rma_id", updatable = false)
    private RmaRecord rma;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40, updatable = false)
    private NotificationEventType eventType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20, updatable = false)
    private NotificationSeverity severity;

    @Column(nullable = false, length = 160, updatable = false)
    private String title;

    @Column(nullable = false, length = 500, updatable = false)
    private String message;

    @Column(length = 200, updatable = false)
    private String actionPath;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    private Instant readAt;

    private Instant snoozedUntil;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private NotificationEmailStatus emailStatus = NotificationEmailStatus.NOT_REQUESTED;

    @Column(length = 500)
    private String emailError;
}
