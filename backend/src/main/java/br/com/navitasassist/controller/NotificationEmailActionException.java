package br.com.navitasassist.controller;

import org.springframework.http.HttpStatus;
import lombok.Getter;

@Getter
public class NotificationEmailActionException extends RuntimeException {
    private final HttpStatus status;
    public NotificationEmailActionException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }
}
