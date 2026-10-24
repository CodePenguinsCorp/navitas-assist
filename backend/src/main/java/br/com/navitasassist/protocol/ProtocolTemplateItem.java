package br.com.navitasassist.protocol;

import java.math.BigDecimal;

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
@Table(name = "protocol_template_items")
public class ProtocolTemplateItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "version_id", nullable = false)
    private ProtocolTemplateVersion version;

    @Column(nullable = false)
    private int sortOrder;

    @Column(nullable = false, length = 120)
    private String stepName;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(length = 1000)
    private String instructions;

    @Enumerated(EnumType.STRING)
    @Column(name = "item_type", nullable = false, length = 20)
    private ProtocolItemType type;

    @Column(nullable = false)
    private boolean required;

    @Column(length = 20)
    private String unit;

    @Column
    private Integer decimalPlaces;

    @Column(precision = 19, scale = 6)
    private BigDecimal minValue;

    @Column(precision = 19, scale = 6)
    private BigDecimal maxValue;

    @Column(length = 500)
    private String expectedResult;

    @Column(nullable = false)
    private boolean evidenceRequired;
}
