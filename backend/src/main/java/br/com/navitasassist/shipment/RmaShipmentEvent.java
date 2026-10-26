package br.com.navitasassist.shipment;

import java.time.Instant;

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
import org.hibernate.annotations.Immutable;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Immutable
@Table(name = "rma_shipment_events")
public class RmaShipmentEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "shipment_id", nullable = false)
    private RmaShipment shipment;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ShipmentEventSource source;

    @Column(length = 120)
    private String externalEventId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private ShipmentStatus status;

    @Column(length = 500)
    private String description;

    @Column(length = 255)
    private String proofReference;

    @Column(length = 500)
    private String justification;

    @Column(nullable = false)
    private Instant occurredAt;

    @Column(nullable = false, length = 120)
    private String recordedBy;

    @Column(nullable = false)
    private Instant recordedAt;
}
