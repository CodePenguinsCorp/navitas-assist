package br.com.navitasassist.kanban;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Digits;
import java.math.BigDecimal;

public record WipLimitRequest(@Positive @Max(100000) @Digits(integer = 6, fraction = 0) BigDecimal maxItems, boolean blocking) {}
