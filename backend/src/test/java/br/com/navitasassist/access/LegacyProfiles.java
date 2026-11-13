package br.com.navitasassist.access;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Permissões dos 4 perfis migrados, copiadas literalmente da tabela da spec §3.
 * É o mapa usado pelos mocks de MockMvc ({@link AccessTestSupport#asProfile}).
 */
public final class LegacyProfiles {

    public static final Map<String, Set<String>> PERMISSIONS = Map.of(
        "ADMIN", ordered(
            "rma.ver", "rma.abrir", "rma.editar", "rma.status", "rma.responsavel", "rma.diagnosticar", "rma.impedimentos",
            "cadastros.ver", "cadastros.editar", "cadastros.importar",
            "pecas.ver", "pecas.movimentar", "pecas.reservar",
            "protocolos.ver", "protocolos.executar", "protocolos.catalogo",
            "relatorios.ver",
            "usuarios.gerir", "perfis.gerir", "notificacoes.regras"),
        "SERVICE_DESK", ordered(
            "rma.ver", "rma.abrir", "rma.editar", "rma.status", "rma.responsavel", "rma.impedimentos",
            "cadastros.ver", "cadastros.editar",
            "pecas.ver", "pecas.movimentar",
            "protocolos.ver"),
        "TECHNICIAN", ordered(
            "rma.ver", "rma.status", "rma.atribuivel", "rma.diagnosticar", "rma.impedimentos",
            "cadastros.ver",
            "pecas.ver", "pecas.reservar",
            "protocolos.ver", "protocolos.executar",
            "relatorios.ver"),
        "VIEWER", ordered(
            "rma.ver",
            "cadastros.ver",
            "pecas.ver",
            "protocolos.ver",
            "relatorios.ver")
    );

    private LegacyProfiles() {
    }

    public static String[] authorities(String code) {
        Set<String> permissions = PERMISSIONS.get(code);
        if (permissions == null) {
            throw new IllegalArgumentException("Perfil legado desconhecido: " + code);
        }
        return permissions.toArray(String[]::new);
    }

    private static Set<String> ordered(String... codes) {
        return java.util.Collections.unmodifiableSet(new LinkedHashSet<>(List.of(codes)));
    }
}
