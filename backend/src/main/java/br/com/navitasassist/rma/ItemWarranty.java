package br.com.navitasassist.rma;

import java.time.LocalDate;

public record ItemWarranty(int months, LocalDate expiresAt, WarrantyStatus status) {

    public static ItemWarranty calculate(RmaRecord rma, int months) {
        return calculate(rma.isPurchaseDateUnknown(), rma.getPurchaseDate(), rma.getEntryDate(), months);
    }

    public static ItemWarranty calculate(boolean purchaseDateUnknown, LocalDate purchaseDate, LocalDate entryDate, int months) {
        if (purchaseDateUnknown || purchaseDate == null) {
            return new ItemWarranty(months, null, WarrantyStatus.PENDING);
        }

        LocalDate expiresAt = purchaseDate.plusMonths(months);
        WarrantyStatus status = expiresAt.isBefore(entryDate)
            ? WarrantyStatus.OUT_OF_WARRANTY
            : WarrantyStatus.IN_WARRANTY;
        return new ItemWarranty(months, expiresAt, status);
    }
}
