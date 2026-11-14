package br.com.navitasassist.controller;

import br.com.navitasassist.part.PartConsumptionRequest;
import br.com.navitasassist.part.PartReservationRequest;
import br.com.navitasassist.part.PartReservationResponse;
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

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PartReservationResponse reserve(@PathVariable Long rmaId, @Valid @RequestBody PartReservationRequest request, Authentication authentication) {
        return mask(partStockService.reserve(rmaId, request), authentication);
    }

    @PostMapping("/{reservationId}/allocate")
    public PartReservationResponse allocate(@PathVariable Long rmaId, @PathVariable Long reservationId, Authentication authentication) {
        return mask(partStockService.allocate(rmaId, reservationId), authentication);
    }

    @PostMapping("/{reservationId}/consume")
    public PartReservationResponse consume(@PathVariable Long rmaId, @PathVariable Long reservationId, @Valid @RequestBody PartConsumptionRequest request,
        Authentication authentication) {
        return mask(partStockService.consume(rmaId, reservationId, request), authentication);
    }

    @PostMapping("/{reservationId}/cancel")
    public PartReservationResponse cancel(@PathVariable Long rmaId, @PathVariable Long reservationId, Authentication authentication) {
        return mask(partStockService.cancel(rmaId, reservationId), authentication);
    }

    /** Custos de peças só para quem tem `pecas.ver`, em leituras e escritas. */
    private static boolean seesCosts(Authentication authentication) {
        return authentication != null && authentication.getAuthorities().stream().anyMatch(authority -> Codes.PECAS_VER.equals(authority.getAuthority()));
    }

    private static PartReservationResponse mask(PartReservationResponse reservation, Authentication authentication) {
        return seesCosts(authentication) ? reservation : reservation.withoutCosts();
    }
}
