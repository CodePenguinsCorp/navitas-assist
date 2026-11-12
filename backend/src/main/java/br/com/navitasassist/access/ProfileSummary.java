package br.com.navitasassist.access;

public record ProfileSummary(Long id, String name) {
    public static ProfileSummary from(AccessProfile profile) {
        return new ProfileSummary(profile.getId(), profile.getName());
    }
}
