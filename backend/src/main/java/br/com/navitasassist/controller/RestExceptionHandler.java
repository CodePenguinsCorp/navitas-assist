package br.com.navitasassist.controller;

import java.time.Instant;
import java.util.List;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.validation.BindException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice
public class RestExceptionHandler {

    @ExceptionHandler(NotificationEmailActionException.class)
    public ResponseEntity<ApiError> handleEmailAction(NotificationEmailActionException exception) {
        return buildResponse(exception.getStatus(), exception.getMessage(), List.of());
    }

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

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiError> handleUnreadableBody(HttpMessageNotReadableException exception) {
        return buildResponse(HttpStatus.BAD_REQUEST, "Malformed request body", List.of());
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiError> handleInvalidParameter(MethodArgumentTypeMismatchException exception) {
        return buildResponse(HttpStatus.BAD_REQUEST, "Invalid request parameter", List.of(exception.getName() + ": invalid value"));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiError> handleAccessDenied(AccessDeniedException exception) {
        return buildResponse(HttpStatus.FORBIDDEN, "Access denied", List.of());
    }

    @ExceptionHandler(BindException.class)
    public ResponseEntity<ApiError> handleQueryValidation(BindException exception) {
        return buildResponse(HttpStatus.BAD_REQUEST, "Invalid query parameters", exception.getFieldErrors().stream().map(this::formatFieldError).toList());
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiError> handleMethodNotAllowed(HttpRequestMethodNotSupportedException exception) {
        return buildResponse(HttpStatus.METHOD_NOT_ALLOWED, "HTTP method not supported", List.of(), exception.getHeaders());
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ApiError> handleUnsupportedMediaType(HttpMediaTypeNotSupportedException exception) {
        return buildResponse(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Content type not supported", List.of(), exception.getHeaders());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleGeneric(Exception exception) {
        return buildResponse(HttpStatus.INTERNAL_SERVER_ERROR, "Unexpected error", List.of());
    }

    private ResponseEntity<ApiError> buildResponse(HttpStatus status, String message, List<String> details) {
        return buildResponse(status, message, details, HttpHeaders.EMPTY);
    }

    private ResponseEntity<ApiError> buildResponse(HttpStatus status, String message, List<String> details, HttpHeaders headers) {
        ApiError apiError = new ApiError(
            Instant.now(),
            status.value(),
            status.getReasonPhrase(),
            message,
            details
        );
        return ResponseEntity.status(status).headers(headers).body(apiError);
    }

    private String formatFieldError(FieldError error) {
        return error.getField() + ": " + error.getDefaultMessage();
    }
}
