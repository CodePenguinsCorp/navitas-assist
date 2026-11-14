package br.com.navitasassist.audit;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import java.time.*;

@Converter
public class AuditInstantConverter implements AttributeConverter<Instant, LocalDateTime> {
    public LocalDateTime convertToDatabaseColumn(Instant value) { return value == null ? null : LocalDateTime.ofInstant(value, ZoneOffset.UTC); }
    public Instant convertToEntityAttribute(LocalDateTime value) { return value == null ? null : value.toInstant(ZoneOffset.UTC); }
}
