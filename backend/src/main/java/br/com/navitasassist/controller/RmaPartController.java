package br.com.navitasassist.controller;

import br.com.navitasassist.part.PartReversalRequest;
import br.com.navitasassist.part.PartUsageRequest;
import br.com.navitasassist.part.PartUsageResponse;
import br.com.navitasassist.part.RmaPartsResponse;
import br.com.navitasassist.service.PartStockService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import br.com.navitasassist.access.Permission.Codes;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/rmas/{rmaId}/parts")
@RequiredArgsConstructor
public class RmaPartController {

    private final PartStockService partStockService;

    @GetMapping
    public RmaPartsResponse getParts(@PathVariable Long rmaId, Authentication authentication) {
        RmaPartsResponse parts = partStockService.getRmaParts(rmaId);
        return seesCosts(authentication) ? parts : parts.withoutCosts();
    }

    @PostMapping("/usages")
    @ResponseStatus(HttpStatus.CREATED)
    public PartUsageResponse use(@PathVariable Long rmaId, @Valid @RequestBody PartUsageRequest request, Authentication authentication) {
        return mask(partStockService.use(rmaId, request), authentication);
    }

    @PostMapping("/usages/{usageId}/reversal")
    public PartUsageResponse undoUse(@PathVariable Long rmaId, @PathVariable Long usageId,
        @Valid @RequestBody PartReversalRequest request, Authentication authentication) {
        return mask(partStockService.undoUse(rmaId, usageId, request), authentication);
    }

    /** Custos de peças só para quem tem `pecas.ver`, em leituras e escritas. */
    private static boolean seesCosts(Authentication authentication) {
        return authentication != null && authentication.getAuthorities().stream().anyMatch(authority -> Codes.PECAS_VER.equals(authority.getAuthority()));
    }

    private static PartUsageResponse mask(PartUsageResponse usage, Authentication authentication) {
        return seesCosts(authentication) ? usage : usage.withoutCosts();
    }
}
