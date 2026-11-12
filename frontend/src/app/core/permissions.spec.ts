import { LEGACY_PROFILE_PERMISSIONS } from '../testing/permission-fixtures';
import { PERMISSIONS, isPermission } from './permissions';

// Lista literal da spec §3, na ordem do catálogo. A mesma lista está em PermissionTest (backend).
const SPEC_CATALOG = [
  'rma.ver', 'rma.abrir', 'rma.editar', 'rma.status', 'rma.responsavel', 'rma.atribuivel', 'rma.diagnosticar',
  'rma.impedimentos', 'cadastros.ver', 'cadastros.editar', 'pecas.ver', 'pecas.movimentar', 'pecas.reservar',
  'protocolos.ver', 'protocolos.executar', 'protocolos.catalogo', 'relatorios.ver', 'usuarios.gerir',
  'perfis.gerir', 'notificacoes.regras',
];

const BACKEND_CATALOG = '../backend/src/main/java/br/com/navitasassist/access/Permission.java';

describe('permission catalog', () => {
  it('matches the spec catalog in order', () => {
    expect([...PERMISSIONS]).toEqual(SPEC_CATALOG);
  });

  it('mirrors the backend Permission enum in order', async () => {
    // O teste roda no Node a partir de frontend/; ler o enum evita que os dois catálogos divirjam em silêncio.
    const fsModule = 'node:fs';
    const { readFileSync } = await import(/* @vite-ignore */ fsModule);
    const source: string = readFileSync(BACKEND_CATALOG, 'utf8');
    const start = source.indexOf('{', source.indexOf('public enum Permission'));
    const enumBody = source.slice(start + 1, source.indexOf(';', start));
    const constants = [...enumBody.matchAll(/^\s*([A-Z_]+)\(Codes\.([A-Z_]+),/gm)].map((match) => match[2]);
    const codes = Object.fromEntries(
      [...source.matchAll(/public static final String ([A-Z_]+) = "([^"]+)";/g)].map((match) => [match[1], match[2]]),
    );

    expect(constants).toHaveLength(20);
    expect(constants.map((constant) => codes[constant])).toEqual([...PERMISSIONS]);
  });

  it('keeps the legacy profile fixtures inside the catalog with the spec totals', () => {
    const totals = Object.fromEntries(
      Object.entries(LEGACY_PROFILE_PERMISSIONS).map(([code, permissions]) => [code, permissions.length]),
    );
    expect(totals).toEqual({ ADMIN: 19, SERVICE_DESK: 11, TECHNICIAN: 11, VIEWER: 5 });
    for (const permissions of Object.values(LEGACY_PROFILE_PERMISSIONS)) {
      expect(permissions).toEqual(PERMISSIONS.filter((permission) => permissions.includes(permission)));
    }
    expect(PERMISSIONS.filter((permission) => !LEGACY_PROFILE_PERMISSIONS.ADMIN.includes(permission))).toEqual(['rma.atribuivel']);
  });

  it('recognizes only catalog codes', () => {
    expect(isPermission('rma.ver')).toBe(true);
    expect(isPermission('notificacoes.regras')).toBe(true);
    expect(isPermission('ADMIN')).toBe(false);
    expect(isPermission('rma.apagar')).toBe(false);
    expect(isPermission(undefined)).toBe(false);
  });
});
