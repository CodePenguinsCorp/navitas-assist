package br.com.navitasassist.shipment;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import br.com.navitasassist.config.AuditableEntity;
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
@Table(name = "rma_shipments")
public class RmaShipment extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "rma_id", nullable = false)
    private RmaRecord rma;

    @Enumerated(EnumType.STRING)
    @Column(name = "shipment_type", nullable = false, length = 20)
    private ShipmentType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private ShipmentStatus status = ShipmentStatus.CREATED;

    @Column
    private Instant statusChangedAt;

    @Column(nullable = false, length = 120)
    private String originName;

    @Column(length = 500)
    private String originAddress;

    @Column(nullable = false, length = 120)
    private String destinationName;

    @Column(length = 500)
    private String destinationAddress;

    @Column
    private Instant addressesPurgedAt;

    @Column(nullable = false)
    private int volumes;

    @Column(nullable = false, length = 120)
    private String carrier;

    @Column(nullable = false, length = 120)
    private String carrierKey;

    @Column(length = 120)
    private String serviceName;

    @Column(length = 120)
    private String trackingCode;

    @Column(length = 255)
    private String labelReference;

    @Column(precision = 12, scale = 2)
    private BigDecimal cost;

    @Column
    private Instant closedAt;

    @OneToMany(mappedBy = "shipment")
    @OrderBy("occurredAt DESC, id DESC")
    private List<RmaShipmentEvent> events = new ArrayList<>();

    public void addEvent(RmaShipmentEvent event) {
        event.setShipment(this);
        events.add(event);
    }
}
