package br.com.navitasassist.product;

import br.com.navitasassist.config.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
@Table(name = "products")
public class Product extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 60)
    private String sku;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(length = 80)
    private String category;

    @Column(length = 40)
    private String hardwareVersion;

    @Column(length = 40)
    private String firmwareVersion;

    @Column(nullable = false)
    private Integer defaultWarrantyMonths = 12;

    @Column(length = 1000)
    private String technicalNotes;
}
