package br.com.navitasassist.rma;

import java.time.LocalDate;

public record ItemWarranty(int months, LocalDate expiresAt, WarrantyStatus status) {

    public static ItemWarranty calculate(RmaRecord rma, int months) {
        if (rma.isPurchaseDateUnknown() || rma.getPurchaseDate() == null) {
            return new ItemWarranty(months, null, WarrantyStatus.PENDING);
        }

        LocalDate expiresAt = rma.getPurchaseDate().plusMonths(months);
        WarrantyStatus status = expiresAt.isBefore(rma.getEntryDate())
            ? WarrantyStatus.OUT_OF_WARRANTY
            : WarrantyStatus.IN_WARRANTY;
        return new ItemWarranty(months, expiresAt, status);
    }
}
