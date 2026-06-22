package br.com.navitasassist.controller;

public class BusinessException extends RuntimeException {

    public BusinessException(String message) {
        super(message);
    }
}
