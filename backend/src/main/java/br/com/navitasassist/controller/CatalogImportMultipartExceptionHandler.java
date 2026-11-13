package br.com.navitasassist.controller;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.List;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

// Multipart parsing and mapping errors can occur before Spring selects a controller.
@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice
public class CatalogImportMultipartExceptionHandler {
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiError> handleSize(MaxUploadSizeExceededException exception) {
        return error(HttpStatus.PAYLOAD_TOO_LARGE, "O arquivo excede 2 MiB");
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ApiError> handleType(HttpMediaTypeNotSupportedException exception, HttpServletRequest request) {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        if (!path.matches("/api/(clients|products)/imports/(preview|confirm)")) return new RestExceptionHandler().handleUnsupportedMediaType(exception);
        return error(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Envie um arquivo CSV como multipart/form-data");
    }

    private ResponseEntity<ApiError> error(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(new ApiError(Instant.now(), status.value(), status.getReasonPhrase(), message, List.of()));
    }
}
