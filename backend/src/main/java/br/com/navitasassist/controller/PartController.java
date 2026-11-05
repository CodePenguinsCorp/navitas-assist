package br.com.navitasassist.controller;

import java.util.List;

import br.com.navitasassist.part.PartMovementRequest;
import br.com.navitasassist.part.PartMovementResponse;
import br.com.navitasassist.part.PartReplenishmentResponse;
import br.com.navitasassist.part.PartRequest;
import br.com.navitasassist.part.PartReservationResponse;
import br.com.navitasassist.part.PartResponse;
import br.com.navitasassist.part.PartReversalRequest;
import br.com.navitasassist.service.PartService;
import br.com.navitasassist.service.PartStockService;
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
@RequestMapping("/api/parts")
@RequiredArgsConstructor
public class PartController {

    private final PartService partService;
    private final PartStockService partStockService;

    @GetMapping
    public List<PartResponse> search(@RequestParam(required = false) String query) {
        return partService.search(query);
    }

    @GetMapping("/pending")
    public List<PartReservationResponse> listPending() {
        return partStockService.listPending();
    }

    @GetMapping("/replenishment")
    public List<PartReplenishmentResponse> listReplenishment() {
        return partStockService.listReplenishment();
    }

    @GetMapping("/{id}")
    public PartResponse getById(@PathVariable Long id) {
        return partService.getById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PartResponse create(@Valid @RequestBody PartRequest request) {
        return partService.create(request);
    }

    @PutMapping("/{id}")
    public PartResponse update(@PathVariable Long id, @Valid @RequestBody PartRequest request) {
        return partService.update(id, request);
    }

    @GetMapping("/{id}/movements")
    public List<PartMovementResponse> listMovements(@PathVariable Long id) {
        return partStockService.listMovements(id);
    }

    @PostMapping("/{id}/movements")
    @ResponseStatus(HttpStatus.CREATED)
    public PartMovementResponse registerMovement(@PathVariable Long id, @Valid @RequestBody PartMovementRequest request) {
        return partStockService.registerMovement(id, request);
    }

    @PostMapping("/movements/{movementId}/reversal")
    @ResponseStatus(HttpStatus.CREATED)
    public PartMovementResponse reverse(@PathVariable Long movementId, @Valid @RequestBody PartReversalRequest request) {
        return partStockService.reverse(movementId, request);
    }
}
