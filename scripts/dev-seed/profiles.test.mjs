import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('./seed.mjs', import.meta.url), 'utf8');
const start = source.indexOf('  const demoProfiles =');
const end = source.indexOf("  const users =", start);
const provision = source.slice(start, end);

test('reutiliza também no modo volume o perfil com caixa diferente', () => {
  const volume = source.slice(source.indexOf("    const roles ="));
  const lookup = volume.match(/profileId: (.+), extraPermissions:/)?.[1];
  assert.ok(lookup);
  assert.equal(vm.runInNewContext(lookup, {
    profiles: [{ id: 42, name: 'tÉCNICO' }], role: 'Técnico',
  }), 42);
});

test('cria os três perfis ausentes antes de consultar os usuários', async () => {
  assert.ok(start > 0 && end > start);
  const profiles = [];
  const writes = [];
  await vm.runInNewContext(`(async () => { ${provision} })()`, {
    profiles, count() {},
    async api(path, method, body) {
      writes.push({ path, method, body });
      return { id: writes.length, ...body };
    },
  });
  assert.deepEqual(profiles.map(profile => profile.name), ['Atendimento', 'Técnico', 'Consulta']);
  assert.deepEqual(profiles.map(profile => profile.id), [1, 2, 3]);
  assert.deepEqual(profiles.map(profile => profile.permissions.length), [11, 11, 5]);
  assert.ok(writes.every(row => row.path === '/api/profiles' && row.method === 'POST'));
  for (const profile of profiles) {
    assert.ok(profile.permissions.includes('rma.ver'));
    assert.ok(!profile.permissions.includes('usuarios.gerir'));
    assert.ok(!profile.permissions.includes('perfis.gerir'));
  }
});

test('interrompe a criação quando a API recusa um perfil', async () => {
  const profiles = [];
  let writes = 0;
  await assert.rejects(vm.runInNewContext(`(async () => { ${provision} })()`, {
    profiles, count() {},
    async api() { writes++; throw new Error('HTTP 403'); },
  }), /HTTP 403/);
  assert.equal(writes, 1);
  assert.equal(profiles.length, 0);
});

test('cria os perfis antes dos usuários e reutiliza nomes sem alterar permissões', async () => {
  const existing = { id: 7, name: 'aTENDIMENTO', permissions: ['rma.ver'] };
  const profiles = [existing];
  const writes = [];
  const context = vm.createContext({
    profiles, count() {},
    async api(path, method, body) {
      writes.push({ path, method, body });
      return { id: 10 + writes.length, ...body };
    },
  });
  await vm.runInContext(`(async () => { ${provision} })()`, context);
  assert.deepEqual(writes.map(row => row.body.name), ['Técnico', 'Consulta']);
  assert.ok(writes.every(row => row.path === '/api/profiles' && row.method === 'POST'));
  assert.ok(writes[0].body.permissions.includes('rma.atribuivel'));
  assert.deepEqual(existing.permissions, ['rma.ver']);
  await vm.runInContext(`(async () => { ${provision} })()`, context);
  assert.equal(writes.length, 2);
  assert.equal(profiles.length, 3);
});
