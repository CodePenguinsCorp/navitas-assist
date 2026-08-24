package br.com.navitasassist.controller;

import java.time.Instant;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class RestExceptionHandler {

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ApiError> handleNotFound(ResourceNotFoundException exception) {
        return buildResponse(HttpStatus.NOT_FOUND, exception.getMessage(), List.of());
    }

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiError> handleBusiness(BusinessException exception) {
        return buildResponse(HttpStatus.BAD_REQUEST, exception.getMessage(), List.of());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException exception) {
        List<String> details = exception.getBindingResult()
            .getFieldErrors()
            .stream()
            .map(this::formatFieldError)
            .toList();

        return buildResponse(HttpStatus.BAD_REQUEST, "Validation failed", details);
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiError> handleAccessDenied(AccessDeniedException exception) {
        return buildResponse(HttpStatus.FORBIDDEN, "Access denied", List.of());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleGeneric(Exception exception) {
        return buildResponse(HttpStatus.INTERNAL_SERVER_ERROR, "Unexpected error", List.of());
    }

    private ResponseEntity<ApiError> buildResponse(HttpStatus status, String message, List<String> details) {
        ApiError apiError = new ApiError(
            Instant.now(),
            status.value(),
            status.getReasonPhrase(),
            message,
            details
        );
        return ResponseEntity.status(status).body(apiError);
    }

    private String formatFieldError(FieldError error) {
        return error.getField() + ": " + error.getDefaultMessage();
    }
}
