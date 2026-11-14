package br.com.navitasassist.controller;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.core.annotation.Order;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.dao.DataIntegrityViolationException;
import br.com.navitasassist.catalogimport.CatalogImportException;
import java.time.Instant;
import java.util.List;
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
@RestControllerAdvice(assignableTypes = CatalogImportController.class)
public class CatalogImportExceptionHandler {
    @ExceptionHandler(CatalogImportException.class)
    public ResponseEntity<ApiError> handleImport(CatalogImportException exception) { return error(exception.status(), exception.getMessage()); }
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiError> handleSize(MaxUploadSizeExceededException exception) { return error(HttpStatus.PAYLOAD_TOO_LARGE, "O arquivo excede 2 MiB"); }
    @ExceptionHandler(MissingServletRequestPartException.class)
    public ResponseEntity<ApiError> handleMissing(MissingServletRequestPartException exception) { return error(HttpStatus.BAD_REQUEST, "Selecione um arquivo CSV"); }
    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ApiError> handleType(HttpMediaTypeNotSupportedException exception) { return error(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Envie um arquivo CSV como multipart/form-data"); }
    @ExceptionHandler({DataIntegrityViolationException.class, BusinessException.class})
    public ResponseEntity<ApiError> handleConflict(RuntimeException exception) { return error(HttpStatus.CONFLICT, "Não foi possível concluir a importação. Gere uma nova prévia"); }
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleUnexpected(Exception exception) { return error(HttpStatus.INTERNAL_SERVER_ERROR, "Não foi possível concluir a importação"); }
    private ResponseEntity<ApiError> error(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(new ApiError(Instant.now(), status.value(), status.getReasonPhrase(), message, List.of()));
    }
}
