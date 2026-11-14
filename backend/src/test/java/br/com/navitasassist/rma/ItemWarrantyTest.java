package br.com.navitasassist.rma;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.time.LocalDate;

import br.com.navitasassist.product.Product;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class ItemWarrantyTest {

    @ParameterizedTest
    @CsvSource({
        "2025-01-01, 2026-07-01, 12, 2026-01-01, OUT_OF_WARRANTY",
        "2025-01-01, 2026-07-01, 24, 2027-01-01, IN_WARRANTY",
        "2025-01-01, 2026-01-01, 12, 2026-01-01, IN_WARRANTY",
        "2025-01-01, 2026-01-02, 12, 2026-01-01, OUT_OF_WARRANTY",
        "2024-02-29, 2025-02-28, 12, 2025-02-28, IN_WARRANTY",
        "2024-02-29, 2025-03-01, 12, 2025-02-28, OUT_OF_WARRANTY"
    })
    void shouldUseOnlyTheItemTerm(LocalDate purchase, LocalDate entry, int months, LocalDate expiry, WarrantyStatus status) {
        RmaRecord rma = new RmaRecord();
        rma.setPurchaseDate(purchase);
        rma.setEntryDate(entry);

        assertEquals(new ItemWarranty(months, expiry, status), ItemWarranty.calculate(rma, months));
    }

    @Test
    void shouldRemainPendingWithoutPurchaseDate() {
        RmaRecord rma = new RmaRecord();
        rma.setEntryDate(LocalDate.of(2026, 1, 1));
        ItemWarranty warranty = ItemWarranty.calculate(rma, 12);

        assertEquals(WarrantyStatus.PENDING, warranty.status());
        assertNull(warranty.expiresAt());
    }

    @Test
    void shouldUseCurrentProductTermForLegacyItemWithoutSnapshot() {
        Product product = new Product();
        product.setSku("LEGACY");
        product.setName("Legacy product");
        product.setDefaultWarrantyMonths(18);

        RmaRecord rma = new RmaRecord();
        rma.setPurchaseDate(LocalDate.of(2025, 1, 1));
        rma.setEntryDate(LocalDate.of(2026, 6, 30));

        RmaItem item = new RmaItem();
        item.setRma(rma);
        item.setProduct(product);

        RmaItemResponse response = RmaItemResponse.from(item);

        assertEquals(18, response.warrantyMonths());
        assertEquals(LocalDate.of(2026, 7, 1), response.warrantyExpiresAt());
        assertEquals(WarrantyStatus.IN_WARRANTY, response.warrantyStatus());
    }

    @ParameterizedTest
    @CsvSource({
        "2024-01-01, false, OUT_OF_WARRANTY, IN_WARRANTY",
        "2026-01-01, false, IN_WARRANTY, OUT_OF_WARRANTY",
        ", true, PENDING, IN_WARRANTY",
        ", true, PENDING, OUT_OF_WARRANTY"
    })
    void overrideWinsWithoutChangingTheCalculatedWarranty(LocalDate purchase, boolean unknown, WarrantyStatus calculated, WarrantyStatus override) {
        Product product = new Product();
        product.setDefaultWarrantyMonths(12);
        RmaRecord rma = new RmaRecord();
        rma.setPurchaseDate(purchase);
        rma.setPurchaseDateUnknown(unknown);
        rma.setEntryDate(LocalDate.of(2026, 1, 1));
        RmaItem item = new RmaItem();
        item.setRma(rma);
        item.setProduct(product);
        item.setWarrantyOverride(override);
        item.setWarrantyOverrideReason("Cortesia");
        item.setWarrantyOverrideBy("desk");
        item.setWarrantyOverrideAt(java.time.Instant.parse("2026-01-01T12:00:00Z"));

        RmaItemResponse response = RmaItemResponse.from(item);
        assertEquals(override, response.warrantyStatus());
        assertEquals(calculated, response.calculatedWarrantyStatus());
        assertEquals("Cortesia", response.warrantyOverride().reason());
        item.setWarrantyOverride(null);
        response = RmaItemResponse.from(item);
        assertEquals(calculated, response.warrantyStatus());
        assertNull(response.warrantyOverride());
    }
}
