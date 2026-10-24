package br.com.navitasassist.protocol;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import br.com.navitasassist.rma.RmaStatus;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.Immutable;

/**
 * Frozen snapshot of a protocol. Executions point to a version, so editing a template only creates a new version.
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Immutable
@Table(name = "protocol_template_versions")
public class ProtocolTemplateVersion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "template_id", nullable = false)
    private ProtocolTemplate template;

    @Column(nullable = false)
    private int versionNumber;

    @Column(length = 255)
    private String blockedStatuses;

    @Column(nullable = false, length = 120)
    private String createdBy;

    @Column(nullable = false)
    private Instant createdAt;

    @OneToMany(mappedBy = "version", cascade = CascadeType.PERSIST)
    @OrderBy("sortOrder ASC")
    private List<ProtocolTemplateItem> items = new ArrayList<>();

    public Set<RmaStatus> blockedStatusSet() {
        if (blockedStatuses == null || blockedStatuses.isBlank()) {
            return EnumSet.noneOf(RmaStatus.class);
        }
        return Arrays.stream(blockedStatuses.split(",")).map(RmaStatus::valueOf).collect(Collectors.toCollection(() -> EnumSet.noneOf(RmaStatus.class)));
    }

    public void setBlockedStatusSet(Set<RmaStatus> statuses) {
        blockedStatuses = statuses == null || statuses.isEmpty() ? null : statuses.stream().sorted().map(Enum::name).collect(Collectors.joining(","));
    }

    public void addItem(ProtocolTemplateItem item) {
        item.setVersion(this);
        item.setSortOrder(items.size() + 1);
        items.add(item);
    }
}
