package br.com.navitasassist.part;

import java.math.BigDecimal;

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
@Table(name = "parts")
public class Part extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 60)
    private String code;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(nullable = false, length = 20)
    private String unit;

    @Column(length = 120)
    private String location;

    @Column(nullable = false, precision = 12, scale = 3)
    private BigDecimal minimumStock = BigDecimal.ZERO;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal unitCost = BigDecimal.ZERO;

    @Column(name = "on_hand_quantity", nullable = false, precision = 12, scale = 3)
    private BigDecimal onHand = BigDecimal.ZERO;

    @Column(name = "reserved_quantity", nullable = false, precision = 12, scale = 3)
    private BigDecimal reserved = BigDecimal.ZERO;

    @Column(nullable = false)
    private boolean active = true;

    public BigDecimal getAvailable() {
        return onHand.subtract(reserved);
    }

    public boolean isBelowMinimum() {
        return getAvailable().compareTo(minimumStock) < 0;
    }
}
