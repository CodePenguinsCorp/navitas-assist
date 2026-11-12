import { LEGACY_PROFILE_PERMISSIONS } from '../testing/permission-fixtures';
import { PERMISSION_CATALOG } from '../testing/profile-fixtures';
import { PERMISSIONS, isPermission } from './permissions';

// Lista literal da spec §3, na ordem do catálogo. A mesma lista está em PermissionTest (backend).
const SPEC_CATALOG = [
  'rma.ver', 'rma.abrir', 'rma.editar', 'rma.status', 'rma.responsavel', 'rma.atribuivel', 'rma.diagnosticar',
  'rma.impedimentos', 'cadastros.ver', 'cadastros.editar', 'pecas.ver', 'pecas.movimentar', 'pecas.reservar',
  'protocolos.ver', 'protocolos.executar', 'protocolos.catalogo', 'relatorios.ver', 'usuarios.gerir',
  'perfis.gerir', 'notificacoes.regras',
];

const BACKEND_CATALOG = '../backend/src/main/java/br/com/navitasassist/access/Permission.java';
const BACKEND_MODULES = '../backend/src/main/java/br/com/navitasassist/access/PermissionModule.java';
const LEGACY_MIGRATION = '../backend/src/main/resources/db/migration/V1__baseline.sql';

// O teste roda no Node a partir de frontend/; ler os arquivos do backend evita que os catálogos divirjam em silêncio.
async function readBackendFile(path: string): Promise<string> {
  const fsModule = 'node:fs';
  const { readFileSync } = await import(/* @vite-ignore */ fsModule);
  return readFileSync(path, 'utf8');
}

describe('permission catalog', () => {
  it('matches the spec catalog in order', () => {
    expect([...PERMISSIONS]).toEqual(SPEC_CATALOG);
  });

  it('mirrors the backend Permission enum in order', async () => {
    const source = await readBackendFile(BACKEND_CATALOG);
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

  it('keeps the legacy profile fixtures equal to the V8 migration', async () => {
    const migration = await readBackendFile(LEGACY_MIGRATION);
    const grants = [...migration.matchAll(/SELECT id, '([a-z.]+)' FROM access_profiles WHERE legacy_code IN \(([^)]*)\)/g)]
      .map((match) => ({ permission: match[1], profiles: [...match[2].matchAll(/'([A-Z_]+)'/g)].map((profile) => profile[1]) }));
    expect(grants).toHaveLength(PERMISSIONS.length);
    const fromMigration = Object.fromEntries(Object.keys(LEGACY_PROFILE_PERMISSIONS).map((code) => [
      code, PERMISSIONS.filter((permission) => grants.some((grant) => grant.permission === permission && grant.profiles.includes(code)))
    ]));

    expect(fromMigration).toEqual(LEGACY_PROFILE_PERMISSIONS);
  });

  it('keeps the catalog fixture labels equal to the backend enums', async () => {
    const permissions = await readBackendFile(BACKEND_CATALOG);
    const modules = await readBackendFile(BACKEND_MODULES);
    const codes = Object.fromEntries(
      [...permissions.matchAll(/public static final String ([A-Z_]+) = "([^"]+)";/g)].map((match) => [match[1], match[2]]),
    );
    const moduleLabels = Object.fromEntries([...modules.matchAll(/^\s*([A-Z_]+)\("([^"]+)"\)[,;]/gm)].map((match) => [match[1], match[2]]));
    const backend = Object.keys(moduleLabels).map((module) => ({
      module,
      label: moduleLabels[module],
      permissions: [...permissions.matchAll(/^\s*[A-Z_]+\(Codes\.([A-Z_]+), PermissionModule\.([A-Z_]+), "([^"]+)"\)/gm)]
        .filter((match) => match[2] === module)
        .map((match) => ({ code: codes[match[1]], label: match[3] }))
    }));

    expect(backend.flatMap((module) => module.permissions)).toHaveLength(PERMISSIONS.length);
    expect(PERMISSION_CATALOG).toEqual(backend);
  });

  it('recognizes only catalog codes', () => {
    expect(isPermission('rma.ver')).toBe(true);
    expect(isPermission('notificacoes.regras')).toBe(true);
    expect(isPermission('ADMIN')).toBe(false);
    expect(isPermission('rma.apagar')).toBe(false);
    expect(isPermission(undefined)).toBe(false);
  });
});
