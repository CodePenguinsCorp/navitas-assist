package br.com.navitasassist.controller;

public class CarrierUnavailableException extends RuntimeException {

    public CarrierUnavailableException(String message) {
        super(message);
    }
}
