package br.com.navitasassist.part;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.lang.reflect.Field;
import java.util.List;

import jakarta.persistence.Enumerated;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.junit.jupiter.api.Test;

/**
 * Part enums are VARCHAR columns with CHECK constraints. The explicit type keeps the mapping independent of the dialect's
 * default for enums (a native ENUM or SMALLINT would fail schema validation at startup).
 */
class PartEnumMappingTest {

    @Test
    void enumColumnsAreMappedAsVarchar() {
        for (Class<?> entity : List.of(PartMovement.class, PartReservation.class)) {
            for (Field field : entity.getDeclaredFields()) {
                if (field.isAnnotationPresent(Enumerated.class)) {
                    JdbcTypeCode type = field.getAnnotation(JdbcTypeCode.class);
                    assertEquals(SqlTypes.VARCHAR, type == null ? null : type.value(), entity.getSimpleName() + "." + field.getName());
                }
            }
        }
    }
}
