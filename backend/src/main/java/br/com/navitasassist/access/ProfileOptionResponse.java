package br.com.navitasassist.access;

import java.util.List;

public record ProfileOptionResponse(Long id, String name, List<String> permissions) {
    public static ProfileOptionResponse from(AccessProfile profile) {
        return new ProfileOptionResponse(profile.getId(), profile.getName(), ProfileResponse.orderedCodes(profile));
    }
}
