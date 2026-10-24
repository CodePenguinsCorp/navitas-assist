package br.com.navitasassist.controller;

import java.util.List;

import br.com.navitasassist.service.ShipmentService;
import br.com.navitasassist.shipment.CarrierEventIngestResponse;
import br.com.navitasassist.shipment.CarrierEventRequest;
import br.com.navitasassist.shipment.CreateShipmentRequest;
import br.com.navitasassist.shipment.ManualShipmentEventRequest;
import br.com.navitasassist.shipment.RmaShipmentSummaryResponse;
import br.com.navitasassist.shipment.ShipmentDetailResponse;
import br.com.navitasassist.shipment.ShipmentResponse;
import br.com.navitasassist.shipment.ShipmentStatus;
import br.com.navitasassist.shipment.UpdateShipmentRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/shipments")
@RequiredArgsConstructor
public class ShipmentController {

    private final ShipmentService shipmentService;

    @GetMapping
    public List<ShipmentResponse> search(
        @RequestParam(required = false) Long rmaId,
        @RequestParam(required = false) ShipmentStatus status
    ) {
        return shipmentService.search(rmaId, status);
    }

    @GetMapping("/{id}")
    public ShipmentDetailResponse getDetail(@PathVariable Long id) {
        return shipmentService.getDetail(id);
    }

    @GetMapping("/rma/{rmaId}/summary")
    public RmaShipmentSummaryResponse summarize(@PathVariable Long rmaId) {
        return shipmentService.summarize(rmaId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ShipmentDetailResponse create(@Valid @RequestBody CreateShipmentRequest request) {
        return shipmentService.create(request);
    }

    @PutMapping("/{id}")
    public ShipmentDetailResponse update(@PathVariable Long id, @Valid @RequestBody UpdateShipmentRequest request) {
        return shipmentService.update(id, request);
    }

    @PostMapping("/{id}/events")
    @ResponseStatus(HttpStatus.CREATED)
    public ShipmentDetailResponse addManualEvent(@PathVariable Long id, @Valid @RequestBody ManualShipmentEventRequest request) {
        return shipmentService.addManualEvent(id, request);
    }

    @PostMapping("/{id}/sync")
    public ShipmentDetailResponse sync(@PathVariable Long id) {
        return shipmentService.sync(id);
    }

    @PostMapping("/events/ingest")
    public CarrierEventIngestResponse ingest(@Valid @RequestBody CarrierEventRequest request) {
        return shipmentService.ingest(request);
    }
}
