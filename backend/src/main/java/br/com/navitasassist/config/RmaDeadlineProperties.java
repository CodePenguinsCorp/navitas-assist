package br.com.navitasassist.config;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;

/** Window, in calendar days before the due date, in which an open RMA is "Perto do limite". */
@Getter
@Setter
@Component
@Validated
@ConfigurationProperties(prefix = "navitas.deadline")
public class RmaDeadlineProperties {

    @Min(0)
    @Max(90)
    private int warningDays = 7;
}
