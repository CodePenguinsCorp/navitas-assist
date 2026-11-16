package br.com.navitasassist.support;

import br.com.navitasassist.product.Product;
import br.com.navitasassist.rma.RmaItem;
import br.com.navitasassist.rma.RmaRecord;

public final class RmaTestSupport {
    private RmaTestSupport() { }

    public static RmaItem addItem(RmaRecord rma, Product product) {
        RmaItem item = new RmaItem();
        item.setProduct(product);
        item.setWarrantyMonths(product.getDefaultWarrantyMonths());
        item.getItemIdentification().setSerialNumber(rma.getCode() == null ? java.util.UUID.randomUUID().toString() : rma.getCode());
        rma.addItem(item);
        return item;
    }
}
