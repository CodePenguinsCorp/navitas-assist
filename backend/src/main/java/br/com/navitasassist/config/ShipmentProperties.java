package br.com.navitasassist.config;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;

@Getter
@Setter
@Component
@Validated
@ConfigurationProperties(prefix = "navitas.shipments")
public class ShipmentProperties {

    @Min(1)
    @Max(3650)
    private int addressRetentionDays = 365;
}
