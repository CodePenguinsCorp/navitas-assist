package br.com.navitasassist.user;

import java.util.HashSet;
import java.util.Set;

import br.com.navitasassist.access.AccessProfile;
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
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.Fetch;
import org.hibernate.annotations.FetchMode;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "user_accounts")
public class UserAccount extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 60)
    private String username;

    @Column(nullable = false, length = 120)
    private String fullName;

    @Column(length = 254)
    private String email;

    @Column(nullable = false, length = 255)
    private String passwordHash;

    // O lock do login trava só esta linha; perfil e coleções vêm em selects próprios, sem lock.
    @ManyToOne(optional = false, fetch = FetchType.EAGER)
    @Fetch(FetchMode.SELECT)
    @JoinColumn(name = "profile_id", nullable = false)
    private AccessProfile profile;

    @ElementCollection(fetch = FetchType.EAGER)
    @Fetch(FetchMode.SELECT)
    @CollectionTable(name = "user_account_extra_permissions", joinColumns = @JoinColumn(name = "user_id"))
    @Column(name = "permission", nullable = false, length = 60)
    private Set<String> extraPermissions = new HashSet<>();

    @Column(nullable = false)
    private boolean active = true;
}
