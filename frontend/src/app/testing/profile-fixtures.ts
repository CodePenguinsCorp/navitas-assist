import { PageResponse, PermissionModuleResponse, ProfileResponse } from '../core/models';

/** O catálogo de `GET /api/permissions`, com módulos e rótulos da spec §3. */
export const PERMISSION_CATALOG: PermissionModuleResponse[] = [
  { module: 'RMA', label: 'Ordens de serviço', permissions: [
    { code: 'rma.ver', label: 'Ver ordens de serviço, Kanban e dashboard' },
    { code: 'rma.abrir', label: 'Abrir ordens de serviço' },
    { code: 'rma.editar', label: 'Alterar dados gerais e prioridade' },
    { code: 'rma.status', label: 'Alterar status' },
    { code: 'rma.responsavel', label: 'Atribuir responsável' },
    { code: 'rma.atribuivel', label: 'Pode ser responsável por ordens de serviço' },
    { code: 'rma.diagnosticar', label: 'Registrar diagnóstico' },
    { code: 'rma.impedimentos', label: 'Registrar e resolver impedimentos' }
  ] },
  { module: 'CADASTROS', label: 'Clientes e produtos', permissions: [
    { code: 'cadastros.ver', label: 'Consultar clientes e produtos' },
    { code: 'cadastros.editar', label: 'Criar, alterar e excluir clientes e produtos' },
    { code: 'cadastros.importar', label: 'Importar clientes e produtos' }
  ] },
  { module: 'PECAS', label: 'Peças', permissions: [
    { code: 'pecas.ver', label: 'Consultar peças e estoque' },
    { code: 'pecas.movimentar', label: 'Cadastrar peças e movimentar estoque' },
    { code: 'pecas.reservar', label: 'Reservar e aplicar peças nas ordens de serviço' }
  ] },
  { module: 'PROTOCOLOS', label: 'Protocolos técnicos', permissions: [
    { code: 'protocolos.ver', label: 'Consultar protocolos e execuções' },
    { code: 'protocolos.executar', label: 'Executar protocolos nas ordens de serviço' },
    { code: 'protocolos.catalogo', label: 'Gerenciar modelos de protocolo' }
  ] },
  { module: 'RELATORIOS', label: 'Relatórios', permissions: [
    { code: 'relatorios.ver', label: 'Ver relatórios' }
  ] },
  { module: 'ADMINISTRACAO', label: 'Administração', permissions: [
    { code: 'usuarios.gerir', label: 'Gerenciar usuários' },
    { code: 'perfis.gerir', label: 'Gerenciar perfis e permissões' },
    { code: 'notificacoes.regras', label: 'Configurar regras de notificação' },
    { code: 'auditoria.ver', label: 'Consultar a trilha de auditoria' }
  ] }
];

export function buildProfile(overrides: Partial<ProfileResponse> = {}): ProfileResponse {
  return {
    id: 1, name: 'Técnico', permissions: ['rma.ver', 'rma.status', 'rma.diagnosticar'], userCount: 0,
    createdAt: '2026-11-10T12:00:00Z', updatedAt: '2026-11-11T15:30:00Z',
    ...overrides
  };
}

export function buildProfilePage(content: ProfileResponse[], page = 0, size = 20, totalElements = content.length): PageResponse<ProfileResponse> {
  return { content, page, size, totalElements, totalPages: Math.ceil(totalElements / size) };
}
