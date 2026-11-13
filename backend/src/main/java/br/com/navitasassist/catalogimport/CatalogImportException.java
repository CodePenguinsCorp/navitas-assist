package br.com.navitasassist.catalogimport;

import org.springframework.http.HttpStatus;

public class CatalogImportException extends RuntimeException {
    private final HttpStatus status;
    public CatalogImportException(HttpStatus status, String message) { super(message); this.status = status; }
    public HttpStatus status() { return status; }
}
