package br.com.navitasassist.controller;

import br.com.navitasassist.rma.*;
import br.com.navitasassist.service.RmaRepairService;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/rmas/{rmaId}/repair")
@RequiredArgsConstructor
public class RmaRepairController {
    private final RmaRepairService repairService;

    @GetMapping
    public RmaRepairResponse getRepair(@PathVariable Long rmaId) { return repairService.getRepair(rmaId); }

    @GetMapping("/external-components")
    public List<ExternalComponentResponse> listExternalComponents(@PathVariable Long rmaId) { return repairService.listExternalComponents(rmaId); }

    @PostMapping("/external-components")
    @ResponseStatus(HttpStatus.CREATED)
    public ExternalComponentResponse addExternalComponent(@PathVariable Long rmaId, @Valid @RequestBody ExternalComponentRequest request) {
        return repairService.addExternalComponent(rmaId, request);
    }

    @PostMapping("/interventions")
    @ResponseStatus(HttpStatus.CREATED)
    public InterventionResponse addIntervention(@PathVariable Long rmaId, @Valid @RequestBody InterventionRequest request) {
        return repairService.addIntervention(rmaId, request);
    }
    @PutMapping("/external-components/{id}")
    public ExternalComponentResponse updateExternalComponent(@PathVariable Long rmaId, @PathVariable Long id, @Valid @RequestBody ExternalComponentRequest request) {
        return repairService.updateExternalComponent(rmaId, id, request);
    }

    @PutMapping("/interventions/{id}")
    public InterventionResponse updateIntervention(@PathVariable Long rmaId, @PathVariable Long id, @Valid @RequestBody InterventionRequest request) {
        return repairService.updateIntervention(rmaId, id, request);
    }

    @PostMapping("/external-components/{id}/void")
    public ExternalComponentResponse voidExternalComponent(@PathVariable Long rmaId, @PathVariable Long id, @Valid @RequestBody RepairVoidRequest request) {
        return repairService.voidExternalComponent(rmaId, id, request);
    }

    @PostMapping("/interventions/{id}/void")
    public InterventionResponse voidIntervention(@PathVariable Long rmaId, @PathVariable Long id, @Valid @RequestBody RepairVoidRequest request) {
        return repairService.voidIntervention(rmaId, id, request);
    }
}
