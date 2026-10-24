package br.com.navitasassist.notification;

import java.util.Arrays;
import java.util.EnumSet;
import java.util.Set;
import java.util.stream.Collectors;

import br.com.navitasassist.user.UserRole;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter
public class UserRoleSetConverter implements AttributeConverter<Set<UserRole>, String> {

    @Override
    public String convertToDatabaseColumn(Set<UserRole> roles) {
        return roles == null ? "" : roles.stream().sorted().map(Enum::name).collect(Collectors.joining(","));
    }

    @Override
    public Set<UserRole> convertToEntityAttribute(String value) {
        Set<UserRole> roles = EnumSet.noneOf(UserRole.class);
        if (value != null && !value.isBlank()) {
            Arrays.stream(value.split(",")).map(String::trim).filter(role -> !role.isEmpty()).map(UserRole::valueOf).forEach(roles::add);
        }
        return roles;
    }
}
