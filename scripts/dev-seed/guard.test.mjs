import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

// Executa só a validação inicial: nenhum acesso à rede ou escrita no ambiente.
const guard = readFileSync(new URL('./seed.mjs', import.meta.url), 'utf8').split("const password =")[0];
function validate(env) {
  vm.runInNewContext(guard, { URL, process: { env } });
}
const remote = { SEED_BASE_URL: 'https://teste.vercel.app', SEED_ALLOW_REMOTE: '1', SEED_USER: 'admin', SEED_PASSWORD: 'senha-ficticia' };

test('mantém loopback permitido e remoto bloqueado por padrão', () => {
  for (const url of ['http://localhost:4201', 'http://127.0.0.1:4201', 'http://[::1]:4201']) {
    assert.doesNotThrow(() => validate({ SEED_BASE_URL: url }));
  }
  for (const flag of [undefined, '0', 'true']) {
    assert.throws(() => validate({ ...remote, SEED_ALLOW_REMOTE: flag }));
  }
});
test('libera remoto somente com opção explícita, HTTPS e credenciais', () => {
  assert.doesNotThrow(() => validate(remote));
  for (const key of ['SEED_USER', 'SEED_PASSWORD']) {
    assert.throws(() => validate({ ...remote, [key]: '' }));
  }
});
test('recusa origens com caminho, credenciais, query, fragmento ou protocolo inseguro', () => {
  for (const url of ['http://teste.vercel.app', 'ftp://teste.vercel.app', 'https://teste.vercel.app/api', 'https://teste.vercel.app/?x=1', 'https://teste.vercel.app/#x', 'https://user:pass@teste.vercel.app']) {
    assert.throws(() => validate({ ...remote, SEED_BASE_URL: url }));
  }
});
