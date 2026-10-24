package br.com.navitasassist.service;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Locale;
import java.util.regex.Pattern;

import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.controller.ResourceNotFoundException;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.repository.RmaScanActionRepository;
import br.com.navitasassist.repository.RmaScanCodeRepository;
import br.com.navitasassist.rma.RmaBulkStatusUpdateRequest;
import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.rma.RmaResponse;
import br.com.navitasassist.scan.RmaScanAction;
import br.com.navitasassist.scan.RmaScanCode;
import br.com.navitasassist.scan.ScanActionType;
import br.com.navitasassist.scan.ScanCodeFormat;
import br.com.navitasassist.scan.ScanCodeResponse;
import br.com.navitasassist.scan.ScanStatusChangeRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Scan codes are 160 random bits in Base32 (32 characters, printed as QR) plus 24 random digits (about 80 bits, printed
 * as Code 128): they reveal nothing about the RMA and are not guessable.
 * Malformed, unknown and revoked codes all fail with the same not-found response, so a lookup never confirms existence.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class RmaScanService {

    private static final String NOT_FOUND = "Scan code not found.";
    private static final char[] BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".toCharArray();
    private static final Pattern TOKEN_FORMAT = Pattern.compile("[A-Z2-7]{32}");
    private static final Pattern BARCODE_TOKEN_FORMAT = Pattern.compile("[0-9]{24}");
    private static final SecureRandom RANDOM = new SecureRandom();

    private final RmaScanCodeRepository rmaScanCodeRepository;
    private final RmaScanActionRepository rmaScanActionRepository;
    private final RmaRecordRepository rmaRecordRepository;
    private final RmaService rmaService;
    private final ScanCodeRenderer renderer;

    /**
     * Returns the active code of the RMA, creating one when there is none. The RMA row is locked so concurrent calls
     * cannot create two active codes.
     */
    public ScanCodeResponse issue(Long rmaId) {
        RmaRecord rma = rmaRecordRepository.findByIdForUpdate(rmaId).orElseThrow(() -> new ResourceNotFoundException("RMA not found: " + rmaId));
        return ScanCodeResponse.from(rmaScanCodeRepository.findFirstByRma_IdAndActiveTrueOrderByIdDesc(rmaId).orElseGet(() -> {
            RmaScanCode code = new RmaScanCode();
            code.setRma(rma);
            code.setToken(newToken());
            code.setBarcodeToken(newBarcodeToken());
            code.setCreatedAt(Instant.now());
            code.setCreatedBy(currentUsername());
            return rmaScanCodeRepository.save(code);
        }));
    }

    public void revoke(Long rmaId) {
        rmaRecordRepository.findByIdForUpdate(rmaId).orElseThrow(() -> new ResourceNotFoundException("RMA not found: " + rmaId));
        rmaScanCodeRepository.findFirstByRma_IdAndActiveTrueOrderByIdDesc(rmaId).ifPresent(code -> {
            code.setActive(false);
            code.setRevokedAt(Instant.now());
            code.setRevokedBy(currentUsername());
        });
    }

    @Transactional(readOnly = true)
    public String svg(Long rmaId, ScanCodeFormat format) {
        RmaScanCode code = rmaScanCodeRepository.findFirstByRma_IdAndActiveTrueOrderByIdDesc(rmaId).orElseThrow(() -> new ResourceNotFoundException(NOT_FOUND));
        return renderer.svg(format == ScanCodeFormat.QR ? code.getToken() : code.getBarcodeToken(), format);
    }

    @Transactional(readOnly = true)
    public RmaResponse resolve(String token) {
        return rmaService.getById(activeCode(token).getRma().getId());
    }

    /**
     * Quick status change from a scan. Reuses the locked, expected-status update of the RMA service and records the scan
     * that caused the change.
     */
    public RmaResponse changeStatus(String token, ScanStatusChangeRequest request) {
        RmaScanCode code = activeCode(token);
        if (request.status() == request.expectedStatus()) {
            throw new BusinessException("Choose a status different from the current one.");
        }

        RmaResponse response = rmaService.updateStatusInBulk(code.getRma().getId(), new RmaBulkStatusUpdateRequest(request.status(), request.expectedStatus(), request.note()));

        RmaScanAction action = new RmaScanAction();
        action.setScanCode(code);
        action.setRma(code.getRma());
        action.setAction(ScanActionType.STATUS_CHANGE);
        action.setSource(request.source());
        action.setFromStatus(request.expectedStatus());
        action.setToStatus(request.status());
        action.setNote(request.note() == null || request.note().isBlank() ? null : request.note().trim());
        action.setPerformedBy(currentUsername());
        action.setPerformedAt(Instant.now());
        rmaScanActionRepository.save(action);
        return response;
    }

    private RmaScanCode activeCode(String token) {
        String normalized = token == null ? "" : token.trim().toUpperCase(Locale.ROOT);
        if (TOKEN_FORMAT.matcher(normalized).matches()) {
            return rmaScanCodeRepository.findByTokenAndActiveTrue(normalized).orElseThrow(() -> new ResourceNotFoundException(NOT_FOUND));
        }
        if (BARCODE_TOKEN_FORMAT.matcher(normalized).matches()) {
            return rmaScanCodeRepository.findByBarcodeTokenAndActiveTrue(normalized).orElseThrow(() -> new ResourceNotFoundException(NOT_FOUND));
        }
        throw new ResourceNotFoundException(NOT_FOUND);
    }

    private String newToken() {
        byte[] bytes = new byte[20];
        RANDOM.nextBytes(bytes);
        StringBuilder token = new StringBuilder(32);
        int buffer = 0;
        int bits = 0;
        for (byte value : bytes) {
            buffer = (buffer << 8) | (value & 0xFF);
            bits += 8;
            while (bits >= 5) {
                token.append(BASE32[(buffer >> (bits - 5)) & 31]);
                bits -= 5;
            }
        }
        return token.toString();
    }

    private String newBarcodeToken() {
        StringBuilder token = new StringBuilder(24);
        for (int i = 0; i < 24; i++) {
            token.append(RANDOM.nextInt(10));
        }
        return token.toString();
    }

    private String currentUsername() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            return "system";
        }
        return authentication.getName();
    }
}
