package br.com.navitasassist.access;

/**
 * Módulos do catálogo de permissões, na ordem de exibição.
 */
public enum PermissionModule {
    RMA("RMAs"),
    CADASTROS("Clientes e produtos"),
    PECAS("Peças"),
    PROTOCOLOS("Protocolos técnicos"),
    RELATORIOS("Relatórios"),
    ADMINISTRACAO("Administração");

    private final String label;

    PermissionModule(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}
