package br.com.navitasassist.access;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Arrays;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;

class PermissionTest {

    /** Lista literal da spec §3, na ordem de exibição. */
    private static final List<String> SPEC_CODES = List.of(
        "rma.ver",
        "rma.abrir",
        "rma.editar",
        "rma.status",
        "rma.responsavel",
        "rma.atribuivel",
        "rma.diagnosticar",
        "rma.impedimentos",
        "cadastros.ver",
        "cadastros.editar",
        "cadastros.importar",
        "pecas.ver",
        "pecas.movimentar",
        "pecas.reservar",
        "protocolos.ver",
        "protocolos.executar",
        "protocolos.catalogo",
        "relatorios.ver",
        "usuarios.gerir",
        "perfis.gerir",
        "notificacoes.regras"
    );

    @Test
    void codesMatchSpecCatalogInOrder() {
        assertEquals(SPEC_CODES, Arrays.stream(Permission.values()).map(Permission::code).toList());
    }

    @Test
    void modulesAndLabelsMatchSpec() {
        assertEquals(PermissionModule.RMA, Permission.RMA_ATRIBUIVEL.module());
        assertEquals("Pode ser responsável por RMAs", Permission.RMA_ATRIBUIVEL.label());
        assertEquals(PermissionModule.PECAS, Permission.PECAS_RESERVAR.module());
        assertEquals("Reservar e aplicar peças nos RMAs", Permission.PECAS_RESERVAR.label());
        assertEquals(PermissionModule.ADMINISTRACAO, Permission.NOTIFICACOES_REGRAS.module());
        assertEquals("Configurar regras de notificação", Permission.NOTIFICACOES_REGRAS.label());

        assertEquals(
            List.of("RMAs", "Clientes e produtos", "Peças", "Protocolos técnicos", "Relatórios", "Administração"),
            Arrays.stream(PermissionModule.values()).map(PermissionModule::label).toList());
        assertEquals(
            List.of("RMA", "CADASTROS", "PECAS", "PROTOCOLOS", "RELATORIOS", "ADMINISTRACAO"),
            Arrays.stream(PermissionModule.values()).map(Enum::name).toList());
    }

    @Test
    void fromCodesIgnoresUnknown() {
        assertEquals(
            Set.of(Permission.RMA_VER, Permission.PERFIS_GERIR),
            Permission.fromCodes(List.of("rma.ver", "desconhecida", "perfis.gerir", "RMA.VER")));
        assertTrue(Permission.fromCode("nao.existe").isEmpty());
        assertEquals(Permission.RELATORIOS_VER, Permission.fromCode("relatorios.ver").orElseThrow());
        assertEquals(Set.of("rma.ver", "usuarios.gerir"), Permission.codes(List.of(Permission.RMA_VER, Permission.USUARIOS_GERIR)));
    }
}
