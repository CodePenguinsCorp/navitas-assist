package br.com.navitasassist.rma;

import br.com.navitasassist.item.ItemIdentification;
import br.com.navitasassist.product.Product;
import jakarta.persistence.Column;
import jakarta.persistence.Embedded;
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

    @Column
    private Integer warrantyMonths;

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
