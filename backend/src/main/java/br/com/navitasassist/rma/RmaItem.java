package br.com.navitasassist.rma;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

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
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.BatchSize;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "rma_items")
public class RmaItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "rma_id", nullable = false)
    private RmaRecord rma;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    /** Posição informada pelo usuário; a de menor valor é o item principal (RmaRecord.items ordena por ela). */
    @Column(name = "item_position", nullable = false)
    private int position;

    @Column
    private Integer warrantyMonths;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(length = 30)
    private WarrantyStatus warrantyOverride;

    @Column(length = 255)
    private String warrantyOverrideReason;

    @Column(length = 120)
    private String warrantyOverrideBy;

    @Column
    private Instant warrantyOverrideAt;

    @OneToMany(mappedBy = "item", cascade = CascadeType.ALL)
    @OrderBy("changedAt DESC, id DESC")
    @BatchSize(size = 100)
    private List<RmaItemWarrantyHistory> warrantyHistory = new ArrayList<>();

    public void addWarrantyHistory(RmaItemWarrantyHistory history) {
        history.setItem(this);
        warrantyHistory.add(0, history);
    }

    @Embedded
    private ItemIdentification itemIdentification = new ItemIdentification();

    public ItemIdentification getItemIdentification() {
        // Keep the empty value writable when JPA loads all its columns as null.
        if (itemIdentification == null) {
            itemIdentification = new ItemIdentification();
        }
        return itemIdentification;
    }
}
