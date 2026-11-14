package br.com.navitasassist.user;

import java.io.IOException;
import java.util.Optional;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.deser.std.StdDeserializer;

/**
 * Lê um campo de texto opcional distinguindo ausência de {@code null}: ausente vira {@code null} (o campo não foi
 * enviado), {@code null} explícito vira {@code Optional.empty()} e um texto vira {@code Optional.of(texto)}.
 */
public class PresentStringDeserializer extends StdDeserializer<Optional<String>> {

    public PresentStringDeserializer() {
        super(Optional.class);
    }

    @Override
    public Optional<String> deserialize(JsonParser parser, DeserializationContext context) throws IOException {
        return Optional.ofNullable(context.readValue(parser, String.class));
    }

    @Override
    public Optional<String> getNullValue(DeserializationContext context) {
        return Optional.empty();
    }

    @Override
    public Object getAbsentValue(DeserializationContext context) {
        return null;
    }
}
