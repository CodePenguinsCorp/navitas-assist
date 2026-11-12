package br.com.navitasassist.auth;

import java.io.Serializable;

/**
 * Detalhes gravados no token das sessões criadas por login real. Só essas sessões têm as permissões recalculadas a cada
 * requisição ({@link EffectiveAuthoritiesFilter}), pela conta {@code userId}.
 */
public record LoginSessionDetails(Long userId, String remoteAddress) implements Serializable {
}
