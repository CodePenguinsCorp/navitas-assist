package br.com.navitasassist.controller;

import br.com.navitasassist.rma.RmaResponse;
import br.com.navitasassist.scan.ScanCodeFormat;
import br.com.navitasassist.scan.ScanCodeResponse;
import br.com.navitasassist.scan.ScanStatusChangeRequest;
import br.com.navitasassist.service.RmaScanService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class RmaScanController {

    private static final String SVG = "image/svg+xml";

    private final RmaScanService rmaScanService;

    @PostMapping("/api/rmas/{rmaId}/scan-code")
    public ScanCodeResponse issue(@PathVariable Long rmaId) {
        return rmaScanService.issue(rmaId);
    }

    @PostMapping("/api/rmas/{rmaId}/scan-code/revoke")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revoke(@PathVariable Long rmaId) {
        rmaScanService.revoke(rmaId);
    }

    @GetMapping(value = "/api/rmas/{rmaId}/scan-code/qr.svg", produces = SVG)
    public ResponseEntity<String> qrCode(@PathVariable Long rmaId) {
        return svg(rmaScanService.svg(rmaId, ScanCodeFormat.QR));
    }

    @GetMapping(value = "/api/rmas/{rmaId}/scan-code/barcode.svg", produces = SVG)
    public ResponseEntity<String> barcode(@PathVariable Long rmaId) {
        return svg(rmaScanService.svg(rmaId, ScanCodeFormat.BARCODE));
    }

    @GetMapping("/api/scan/{token}")
    public RmaResponse resolve(@PathVariable String token) {
        return rmaScanService.resolve(token);
    }

    @PostMapping("/api/scan/{token}/status")
    public RmaResponse changeStatus(@PathVariable String token, @Valid @RequestBody ScanStatusChangeRequest request) {
        return rmaScanService.changeStatus(token, request);
    }

    private ResponseEntity<String> svg(String body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("Content-Type", SVG).body(body);
    }
}
