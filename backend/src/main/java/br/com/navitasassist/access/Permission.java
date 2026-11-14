package br.com.navitasassist.access;

import java.util.Arrays;
import java.util.Collection;
import java.util.EnumSet;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Catálogo fixo de permissões. A ordem das constantes é a ordem de exibição.
 */
public enum Permission {
    RMA_VER(Codes.RMA_VER, PermissionModule.RMA, "Ver ordens de serviço, Kanban e dashboard"),
    RMA_ABRIR(Codes.RMA_ABRIR, PermissionModule.RMA, "Abrir ordens de serviço"),
    RMA_EDITAR(Codes.RMA_EDITAR, PermissionModule.RMA, "Alterar dados gerais e prioridade"),
    RMA_STATUS(Codes.RMA_STATUS, PermissionModule.RMA, "Alterar status"),
    RMA_RESPONSAVEL(Codes.RMA_RESPONSAVEL, PermissionModule.RMA, "Atribuir responsável"),
    RMA_ATRIBUIVEL(Codes.RMA_ATRIBUIVEL, PermissionModule.RMA, "Pode ser responsável por ordens de serviço"),
    RMA_DIAGNOSTICAR(Codes.RMA_DIAGNOSTICAR, PermissionModule.RMA, "Registrar diagnóstico"),
    RMA_IMPEDIMENTOS(Codes.RMA_IMPEDIMENTOS, PermissionModule.RMA, "Registrar e resolver impedimentos"),
    CADASTROS_VER(Codes.CADASTROS_VER, PermissionModule.CADASTROS, "Consultar clientes e produtos"),
    CADASTROS_EDITAR(Codes.CADASTROS_EDITAR, PermissionModule.CADASTROS, "Criar, alterar e excluir clientes e produtos"),
    CADASTROS_IMPORTAR(Codes.CADASTROS_IMPORTAR, PermissionModule.CADASTROS, "Importar clientes e produtos"),
    PECAS_VER(Codes.PECAS_VER, PermissionModule.PECAS, "Consultar peças e estoque"),
    PECAS_MOVIMENTAR(Codes.PECAS_MOVIMENTAR, PermissionModule.PECAS, "Cadastrar peças e movimentar estoque"),
    PECAS_RESERVAR(Codes.PECAS_RESERVAR, PermissionModule.PECAS, "Reservar e aplicar peças nas ordens de serviço"),
    PROTOCOLOS_VER(Codes.PROTOCOLOS_VER, PermissionModule.PROTOCOLOS, "Consultar protocolos e execuções"),
    PROTOCOLOS_EXECUTAR(Codes.PROTOCOLOS_EXECUTAR, PermissionModule.PROTOCOLOS, "Executar protocolos nas ordens de serviço"),
    PROTOCOLOS_CATALOGO(Codes.PROTOCOLOS_CATALOGO, PermissionModule.PROTOCOLOS, "Gerenciar modelos de protocolo"),
    RELATORIOS_VER(Codes.RELATORIOS_VER, PermissionModule.RELATORIOS, "Ver relatórios"),
    USUARIOS_GERIR(Codes.USUARIOS_GERIR, PermissionModule.ADMINISTRACAO, "Gerenciar usuários"),
    PERFIS_GERIR(Codes.PERFIS_GERIR, PermissionModule.ADMINISTRACAO, "Gerenciar perfis e permissões"),
    NOTIFICACOES_REGRAS(Codes.NOTIFICACOES_REGRAS, PermissionModule.ADMINISTRACAO, "Configurar regras de notificação"),
    AUDITORIA_VER(Codes.AUDITORIA_VER, PermissionModule.ADMINISTRACAO, "Consultar a trilha de auditoria");

    private static final Map<String, Permission> BY_CODE = Arrays.stream(values())
        .collect(Collectors.toUnmodifiableMap(Permission::code, Function.identity()));

    private final String code;
    private final PermissionModule module;
    private final String label;

    Permission(String code, PermissionModule module, String label) {
        this.code = code;
        this.module = module;
        this.label = label;
    }

    public String code() {
        return code;
    }

    public PermissionModule module() {
        return module;
    }

    public String label() {
        return label;
    }

    public static Optional<Permission> fromCode(String code) {
        return Optional.ofNullable(code == null ? null : BY_CODE.get(code));
    }

    /** Converte códigos em permissões, ignorando os desconhecidos. */
    public static Set<Permission> fromCodes(Collection<String> codes) {
        EnumSet<Permission> permissions = EnumSet.noneOf(Permission.class);
        if (codes != null) {
            codes.forEach(code -> fromCode(code).ifPresent(permissions::add));
        }
        return permissions;
    }

    /** Códigos das permissões, na ordem do catálogo. */
    public static Set<String> codes(Collection<Permission> permissions) {
        EnumSet<Permission> ordered = EnumSet.noneOf(Permission.class);
        ordered.addAll(permissions);
        return ordered.stream()
            .map(Permission::code)
            .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    /** Códigos como constantes, para uso em anotações e na configuração de segurança. */
    public static final class Codes {
        public static final String RMA_VER = "rma.ver";
        public static final String RMA_ABRIR = "rma.abrir";
        public static final String RMA_EDITAR = "rma.editar";
        public static final String RMA_STATUS = "rma.status";
        public static final String RMA_RESPONSAVEL = "rma.responsavel";
        public static final String RMA_ATRIBUIVEL = "rma.atribuivel";
        public static final String RMA_DIAGNOSTICAR = "rma.diagnosticar";
        public static final String RMA_IMPEDIMENTOS = "rma.impedimentos";
        public static final String CADASTROS_VER = "cadastros.ver";
        public static final String CADASTROS_EDITAR = "cadastros.editar";
        public static final String CADASTROS_IMPORTAR = "cadastros.importar";
        public static final String PECAS_VER = "pecas.ver";
        public static final String PECAS_MOVIMENTAR = "pecas.movimentar";
        public static final String PECAS_RESERVAR = "pecas.reservar";
        public static final String PROTOCOLOS_VER = "protocolos.ver";
        public static final String PROTOCOLOS_EXECUTAR = "protocolos.executar";
        public static final String PROTOCOLOS_CATALOGO = "protocolos.catalogo";
        public static final String RELATORIOS_VER = "relatorios.ver";
        public static final String USUARIOS_GERIR = "usuarios.gerir";
        public static final String PERFIS_GERIR = "perfis.gerir";
        public static final String NOTIFICACOES_REGRAS = "notificacoes.regras";
        public static final String AUDITORIA_VER = "auditoria.ver";

        private Codes() {
        }
    }
}
