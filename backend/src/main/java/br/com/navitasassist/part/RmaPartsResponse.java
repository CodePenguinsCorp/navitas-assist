package br.com.navitasassist.part;

import java.math.BigDecimal;
import java.util.List;

public record RmaPartsResponse(Long rmaId, String rmaCode, List<PartUsageResponse> usages,
    List<PartMovementResponse> movements, BigDecimal usedCost, List<PartUsageResponse> replacedComponents) {
    public RmaPartsResponse withoutCosts() {
        return new RmaPartsResponse(rmaId, rmaCode, usages.stream().map(PartUsageResponse::withoutCosts).toList(),
            movements, null, replacedComponents.stream().map(PartUsageResponse::withoutCosts).toList());
    }
}
