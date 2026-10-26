package br.com.navitasassist.controller;

import br.com.navitasassist.part.PartReservationRequest;
import br.com.navitasassist.part.PartReservationResponse;
import br.com.navitasassist.part.RmaPartsResponse;
import br.com.navitasassist.service.PartStockService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
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
    public RmaPartsResponse getParts(@PathVariable Long rmaId) {
        return partStockService.getRmaParts(rmaId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PartReservationResponse reserve(@PathVariable Long rmaId, @Valid @RequestBody PartReservationRequest request) {
        return partStockService.reserve(rmaId, request);
    }

    @PostMapping("/{reservationId}/allocate")
    public PartReservationResponse allocate(@PathVariable Long rmaId, @PathVariable Long reservationId) {
        return partStockService.allocate(rmaId, reservationId);
    }

    @PostMapping("/{reservationId}/consume")
    public PartReservationResponse consume(@PathVariable Long rmaId, @PathVariable Long reservationId) {
        return partStockService.consume(rmaId, reservationId);
    }

    @PostMapping("/{reservationId}/cancel")
    public PartReservationResponse cancel(@PathVariable Long rmaId, @PathVariable Long reservationId) {
        return partStockService.cancel(rmaId, reservationId);
    }
}
