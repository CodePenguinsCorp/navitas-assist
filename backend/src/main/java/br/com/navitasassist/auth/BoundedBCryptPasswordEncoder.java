package br.com.navitasassist.auth;

import java.nio.charset.StandardCharsets;

import br.com.navitasassist.controller.BusinessException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

public final class BoundedBCryptPasswordEncoder extends BCryptPasswordEncoder {

    @Override
    public String encode(CharSequence rawPassword) {
        validatePasswordLength(rawPassword);
        return super.encode(rawPassword);
    }

    @Override
    public boolean matches(CharSequence rawPassword, String encodedPassword) {
        return !exceedsByteLimit(rawPassword) && super.matches(rawPassword, encodedPassword);
    }

    public static void validatePasswordLength(CharSequence password) {
        if (exceedsByteLimit(password)) {
            throw new BusinessException("A senha deve ter no máximo 72 bytes UTF-8.");
        }
    }

    private static boolean exceedsByteLimit(CharSequence password) {
        return password != null && password.toString().getBytes(StandardCharsets.UTF_8).length > 72;
    }
}
