package br.com.navitasassist.access;

import java.util.HashSet;
import java.util.Set;

import br.com.navitasassist.config.AuditableEntity;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.Fetch;
import org.hibernate.annotations.FetchMode;

/**
 * Perfil de acesso: nome e conjunto de códigos de {@link Permission}. Os 4 perfis prontos da migração-base guardam um
 * código fixo em {@code legacyCode} (ADMIN, SERVICE_DESK, TECHNICIAN, VIEWER) e não podem ser excluídos.
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "access_profiles")
public class AccessProfile extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 60)
    private String name;

    @Column(unique = true, length = 30)
    private String legacyCode;

    @ElementCollection(fetch = FetchType.EAGER)
    @Fetch(FetchMode.SELECT)
    @CollectionTable(name = "access_profile_permissions", joinColumns = @JoinColumn(name = "profile_id"))
    @Column(name = "permission", nullable = false, length = 60)
    private Set<String> permissions = new HashSet<>();
}
