package br.com.navitasassist.notification;

/** Estado do canal e uso do teto de envios do provedor real (0 nos limites = sem limite). */
public record NotificationEmailStatusResponse(boolean enabled, String provider, long sentToday, int dailyLimit,
    long sentThisMonth, int monthlyLimit, boolean limitReached) {}
