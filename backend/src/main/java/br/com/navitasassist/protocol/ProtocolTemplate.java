package br.com.navitasassist.protocol;

import java.util.ArrayList;
import java.util.List;

import br.com.navitasassist.config.AuditableEntity;
import br.com.navitasassist.product.Product;
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

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "protocol_templates")
public class ProtocolTemplate extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 120)
    private String name;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id")
    private Product product;

    @Column(length = 80)
    private String category;

    @Column(nullable = false)
    private boolean active = true;

    @Column(nullable = false)
    private int currentVersion;

    @OneToMany(mappedBy = "template", cascade = CascadeType.PERSIST)
    @OrderBy("versionNumber DESC")
    private List<ProtocolTemplateVersion> versions = new ArrayList<>();

    public ProtocolTemplateVersion latestVersion() {
        return versions.stream().filter(version -> version.getVersionNumber() == currentVersion).findFirst()
            .orElseThrow(() -> new IllegalStateException("Protocol template without current version: " + id));
    }

    public void addVersion(ProtocolTemplateVersion version) {
        version.setTemplate(this);
        versions.add(0, version);
        currentVersion = version.getVersionNumber();
    }
}
