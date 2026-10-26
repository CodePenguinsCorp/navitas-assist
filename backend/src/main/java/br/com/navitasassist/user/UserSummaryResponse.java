package br.com.navitasassist.user;

public record UserSummaryResponse(long total, long active, long admins, long roles) {
}
