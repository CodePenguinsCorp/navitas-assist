package br.com.navitasassist.notification;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.util.HashSet;
import java.util.Set;

import br.com.navitasassist.access.AccessProfile;
import br.com.navitasassist.config.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
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

    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, unique = true, length = 40, updatable = false)
    private NotificationEventType eventType;

    @Column(nullable = false)
    private boolean enabled;

    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private NotificationSeverity severity;

    @ManyToMany(fetch = FetchType.EAGER)
    @JoinTable(
        name = "notification_rule_recipient_profiles",
        joinColumns = @JoinColumn(name = "rule_id"),
        inverseJoinColumns = @JoinColumn(name = "profile_id"))
    private Set<AccessProfile> recipientProfiles = new HashSet<>();

    @Column(nullable = false)
    private boolean notifyAssignee;

    @Column(nullable = false)
    private boolean emailEnabled;

    @Column(nullable = false)
    private boolean userMutable;
}
