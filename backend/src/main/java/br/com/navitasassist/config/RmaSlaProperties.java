package br.com.navitasassist.config;

import java.util.EnumMap;
import java.util.Map;

import br.com.navitasassist.rma.RmaPriority;
import br.com.navitasassist.rma.RmaStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;

@Getter
@Setter
@Component
@Validated
@ConfigurationProperties(prefix = "navitas.sla")
public class RmaSlaProperties {

    @Min(1)
    @Max(99)
    private int warningPercent = 80;

    @NotNull
    @Valid
    private Map<RmaStatus, Rule> stages = defaultStages();

    @AssertTrue(message = "SLA rules must cover every active RMA stage")
    public boolean isActiveStageCoverageValid() {
        return stages != null && java.util.List.of(RmaStatus.RECEIVED, RmaStatus.TRIAGE, RmaStatus.IN_DIAGNOSIS,
            RmaStatus.WAITING_PART, RmaStatus.IN_REPAIR, RmaStatus.IN_TESTS).stream().allMatch(stage -> stages.get(stage) != null);
    }

    private static Map<RmaStatus, Rule> defaultStages() {
        Map<RmaStatus, Rule> stages = new EnumMap<>(RmaStatus.class);
        stages.put(RmaStatus.RECEIVED, new Rule(1440));
        stages.put(RmaStatus.TRIAGE, new Rule(1440));
        stages.put(RmaStatus.IN_DIAGNOSIS, new Rule(2880));
        stages.put(RmaStatus.WAITING_PART, new Rule(7200));
        stages.put(RmaStatus.IN_REPAIR, new Rule(4320));
        stages.put(RmaStatus.IN_TESTS, new Rule(1440));
        return stages;
    }

    @Getter
    @Setter
    public static class Rule {
        @Min(1)
        @Max(5256000)
        private long minutes = 1440;

        @NotNull
        private Map<RmaPriority, @NotNull @Min(1) @Max(5256000) Long> priorityMinutes = new EnumMap<>(RmaPriority.class);

        public Rule() {}

        public Rule(long minutes) {
            this.minutes = minutes;
        }

        public long minutesFor(RmaPriority priority) {
            return priorityMinutes.getOrDefault(priority, minutes);
        }
    }
}
