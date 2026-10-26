package br.com.navitasassist.scan;

import java.time.Instant;

public record ScanCodeResponse(Long rmaId, String rmaCode, String token, Instant createdAt, String createdBy) {

    public static ScanCodeResponse from(RmaScanCode code) {
        return new ScanCodeResponse(code.getRma().getId(), code.getRma().getCode(), code.getToken(), code.getCreatedAt(), code.getCreatedBy());
    }
}
