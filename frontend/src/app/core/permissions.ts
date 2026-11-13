/** Catálogo fixo de permissões, na ordem do enum `Permission` do backend. Os rótulos vêm de `GET /api/permissions`. */
export const PERMISSIONS = [
  'rma.ver',
  'rma.abrir',
  'rma.editar',
  'rma.status',
  'rma.responsavel',
  'rma.atribuivel',
  'rma.diagnosticar',
  'rma.impedimentos',
  'cadastros.ver',
  'cadastros.editar',
  'cadastros.importar',
  'pecas.ver',
  'pecas.movimentar',
  'pecas.reservar',
  'protocolos.ver',
  'protocolos.executar',
  'protocolos.catalogo',
  'relatorios.ver',
  'usuarios.gerir',
  'perfis.gerir',
  'notificacoes.regras'
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const CATALOG: ReadonlySet<string> = new Set(PERMISSIONS);

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && CATALOG.has(value);
}
