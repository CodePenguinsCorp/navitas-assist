package br.com.navitasassist.controller;

import java.util.List;

import br.com.navitasassist.protocol.ProtocolExecutionResponse;
import br.com.navitasassist.protocol.ProtocolItemResultRequest;
import br.com.navitasassist.protocol.ProtocolTemplateRequest;
import br.com.navitasassist.protocol.ProtocolTemplateResponse;
import br.com.navitasassist.protocol.StartProtocolExecutionRequest;
import br.com.navitasassist.service.ProtocolExecutionService;
import br.com.navitasassist.service.ProtocolTemplateService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/protocols")
@RequiredArgsConstructor
public class ProtocolController {

    private final ProtocolTemplateService protocolTemplateService;
    private final ProtocolExecutionService protocolExecutionService;

    @GetMapping("/templates")
    public List<ProtocolTemplateResponse> listTemplates() {
        return protocolTemplateService.listAll();
    }

    @GetMapping("/templates/{id}")
    public ProtocolTemplateResponse getTemplate(@PathVariable Long id) {
        return protocolTemplateService.getById(id);
    }

    @PostMapping("/templates")
    @ResponseStatus(HttpStatus.CREATED)
    public ProtocolTemplateResponse createTemplate(@Valid @RequestBody ProtocolTemplateRequest request) {
        return protocolTemplateService.create(request);
    }

    @PutMapping("/templates/{id}")
    public ProtocolTemplateResponse updateTemplate(@PathVariable Long id, @Valid @RequestBody ProtocolTemplateRequest request) {
        return protocolTemplateService.update(id, request);
    }

    @GetMapping("/rmas/{rmaId}/executions")
    public List<ProtocolExecutionResponse> listExecutions(@PathVariable Long rmaId) {
        return protocolExecutionService.listForRma(rmaId);
    }

    @PostMapping("/rmas/{rmaId}/executions")
    @ResponseStatus(HttpStatus.CREATED)
    public ProtocolExecutionResponse startExecution(@PathVariable Long rmaId, @Valid @RequestBody StartProtocolExecutionRequest request) {
        return protocolExecutionService.start(rmaId, request.templateId());
    }

    @PostMapping("/executions/{executionId}/items/{itemId}/results")
    @ResponseStatus(HttpStatus.CREATED)
    public ProtocolExecutionResponse recordResult(@PathVariable Long executionId, @PathVariable Long itemId, @Valid @RequestBody ProtocolItemResultRequest request) {
        return protocolExecutionService.recordResult(executionId, itemId, request);
    }

    @PostMapping("/executions/{executionId}/complete")
    public ProtocolExecutionResponse complete(@PathVariable Long executionId) {
        return protocolExecutionService.complete(executionId);
    }
}
