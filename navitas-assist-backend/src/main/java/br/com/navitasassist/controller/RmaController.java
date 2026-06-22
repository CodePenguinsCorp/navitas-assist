package br.com.navitasassist.controller;

import java.util.List;

import br.com.navitasassist.diagnosis.DiagnosisRequest;
import br.com.navitasassist.rma.CreateRmaRequest;
import br.com.navitasassist.rma.RmaResponse;
import br.com.navitasassist.rma.RmaStatus;
import br.com.navitasassist.rma.RmaStatusUpdateRequest;
import br.com.navitasassist.rma.UpdateRmaRequest;
import br.com.navitasassist.service.RmaService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/rmas")
@RequiredArgsConstructor
public class RmaController {

    private final RmaService rmaService;

    @GetMapping
    public List<RmaResponse> search(
        @RequestParam(required = false) String query,
        @RequestParam(required = false) RmaStatus status
    ) {
        return rmaService.search(query, status);
    }

    @GetMapping("/history")
    public List<RmaResponse> history(
        @RequestParam(required = false) String batchNumber,
        @RequestParam(required = false) String serialNumber
    ) {
        return rmaService.findHistory(batchNumber, serialNumber);
    }

    @GetMapping("/{id}")
    public RmaResponse getById(@PathVariable Long id) {
        return rmaService.getById(id);
    }

    @GetMapping("/code/{code}")
    public RmaResponse getByCode(@PathVariable String code) {
        return rmaService.getByCode(code);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public RmaResponse create(@Valid @RequestBody CreateRmaRequest request) {
        return rmaService.create(request);
    }

    @PutMapping("/{id}")
    public RmaResponse update(@PathVariable Long id, @Valid @RequestBody UpdateRmaRequest request) {
        return rmaService.update(id, request);
    }

    @PatchMapping("/{id}/status")
    public RmaResponse updateStatus(@PathVariable Long id, @Valid @RequestBody RmaStatusUpdateRequest request) {
        return rmaService.updateStatus(id, request);
    }

    @PutMapping("/{id}/diagnosis")
    public RmaResponse upsertDiagnosis(@PathVariable Long id, @Valid @RequestBody DiagnosisRequest request) {
        return rmaService.upsertDiagnosis(id, request);
    }
}
