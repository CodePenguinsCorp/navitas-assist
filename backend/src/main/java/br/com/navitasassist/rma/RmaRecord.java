package br.com.navitasassist.rma;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.config.AuditableEntity;
import br.com.navitasassist.diagnosis.Diagnosis;
import br.com.navitasassist.item.ItemIdentification;
import br.com.navitasassist.product.Product;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Embedded;
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
import jakarta.persistence.OneToOne;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "rmas")
public class RmaRecord extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 20)
    private String code;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "client_id", nullable = false)
    private Client client;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @Embedded
    private ItemIdentification itemIdentification = new ItemIdentification();

    @Column
    private LocalDate purchaseDate;

    @Column(nullable = false)
    private boolean purchaseDateUnknown;

    @Column(nullable = false)
    private LocalDate entryDate;

    @Column(length = 80)
    private String invoiceNumber;

    @Column(length = 180)
    private String invoiceFileName;

    @Column(nullable = false, length = 120)
    private String receivedBy;

    @Column(nullable = false, length = 2000)
    private String reportedFailure;

    @Column(length = 1000)
    private String receivedAccessories;

    @Column(length = 1000)
    private String physicalCondition;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RmaPriority priority = RmaPriority.MEDIUM;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private RmaStatus status = RmaStatus.RECEIVED;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private WarrantyStatus warrantyStatus = WarrantyStatus.PENDING;

    @Column(nullable = false)
    private boolean warrantyOverridden;

    @Column(length = 255)
    private String warrantyJustification;

    @Column(length = 120)
    private String warrantyUpdatedBy;

    @Column
    private Instant warrantyUpdatedAt;

    @Column(length = 2000)
    private String repairSummary;

    @Column(length = 2000)
    private String replacedPartsSummary;

    @Column(length = 2000)
    private String testSummary;

    @Column
    private LocalDate shippedAt;

    @Column(length = 120)
    private String carrier;

    @Column(length = 120)
    private String trackingCode;

    @OneToOne(mappedBy = "rma", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private Diagnosis diagnosis;

    @OneToMany(mappedBy = "rma", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("changedAt DESC")
    private List<RmaStatusHistory> statusHistory = new ArrayList<>();

    public void setDiagnosis(Diagnosis diagnosis) {
        if (diagnosis == null) {
            this.diagnosis = null;
            return;
        }

        diagnosis.setRma(this);
        this.diagnosis = diagnosis;
    }

    public void addStatusHistory(RmaStatusHistory history) {
        history.setRma(this);
        this.statusHistory.add(history);
    }
}
