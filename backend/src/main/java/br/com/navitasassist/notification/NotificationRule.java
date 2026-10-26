package br.com.navitasassist.notification;

import java.util.EnumSet;
import java.util.Set;

import br.com.navitasassist.config.AuditableEntity;
import br.com.navitasassist.user.UserRole;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "notification_rules")
public class NotificationRule extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, unique = true, length = 40, updatable = false)
    private NotificationEventType eventType;

    @Column(nullable = false)
    private boolean enabled;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private NotificationSeverity severity;

    @Convert(converter = UserRoleSetConverter.class)
    @Column(nullable = false, length = 120)
    private Set<UserRole> recipientRoles = EnumSet.noneOf(UserRole.class);

    @Column(nullable = false)
    private boolean notifyAssignee;

    @Column(nullable = false)
    private boolean emailEnabled;

    @Column(nullable = false)
    private boolean userMutable;
}
