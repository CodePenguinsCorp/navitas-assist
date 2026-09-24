package br.com.navitasassist.rma;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.time.LocalDate;

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
}
