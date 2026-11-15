/**
 * Trava de estilos em catraca (anatomia de tela, seção 7).
 *
 * Varre src/styles.css, src/app/** /*.css, *.html (atributos style e blocos style) e os `styles` inline dos componentes
 * e conta, por arquivo, quatro tipos de violação: cor hexadecimal literal, rgb()/rgba() literal, `font-size` em
 * número literal (px, rem, em) e seletor de classe proibido definido fora de styles.css.
 *
 * A dívida existente está em ui-guard.baseline.json (arquivo e quantidade permitida). A contagem só pode DIMINUIR:
 * exceder a baseline, ou aparecer violação em arquivo fora dela, falha; ficar abaixo também falha, para a conquista
 * não se perder. Para reduzir: UI_GUARD_UPDATE=1 npm --prefix frontend test -- --watch=false e commitar o JSON.
 * Declarações de variável (`--token: valor`) não contam: é ali que os literais devem viver.
 */

const BASELINE_PATH = 'src/app/testing/ui-guard.baseline.json';
const ROOTS = ['src'];
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;
const RGB = /\brgba?\(\s*\d/g;
const FONT_SIZE = /^font-size\s*:\s*[\d.]+(?:px|rem|em)\b/;
/** Classes que nunca podem ser definidas localmente: duplicam um bloco compartilhado. */
const FORBIDDEN_CLASSES = ['metric', 'metric-card', 'stat-card', 'status-card', 'summary-card', 'import-metric', 'kpi', 'indicator'];
/** Blocos que só styles.css pode definir. */
const SHARED_BLOCKS = ['page-summary', 'table-card', 'pagination', 'mini-chip', 'status-chip', 'modal-panel'];

interface Fs {
  readdirSync(path: string, options: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
  readFileSync(path: string, encoding: 'utf8'): string;
  writeFileSync(path: string, data: string): void;
}

async function loadFs(): Promise<Fs> {
  const fsModule = 'node:fs';
  return (await import(/* @vite-ignore */ fsModule)) as Fs;
}

function walk(fs: Fs, dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(fs, path, out);
    else if (/\.(css|html|ts)$/.test(entry.name) && !/\.spec\.ts$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) out.push(path);
  }
  return out;
}

/** Trechos de CSS de um arquivo: o próprio CSS, atributos style e blocos style do HTML, styles inline do TypeScript. */
function cssChunks(path: string, source: string): string[] {
  if (path.endsWith('.css')) return [source];
  if (path.endsWith('.html')) {
    const chunks = [...source.matchAll(/\bstyle="([^"]*)"/g)].map((match) => match[1]);
    for (const match of source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) chunks.push(match[1]);
    return chunks;
  }
  return [...source.matchAll(/\bstyles:\s*(?:\[\s*)?`([\s\S]*?)`/g)].map((match) => match[1]);
}

export function countViolations(path: string, source: string): number {
  const isGlobal = path.endsWith('src/styles.css');
  let total = 0;
  for (const chunk of cssChunks(path, source)) {
    const css = chunk.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const part of css.split(/[;{}]/)) {
      const declaration = part.trim();
      if (!declaration.includes(':') || declaration.startsWith('--')) continue;
      if (FONT_SIZE.test(declaration)) total += 1;
      total += (declaration.match(HEX) ?? []).length;
      total += (declaration.match(RGB) ?? []).length;
    }
    if (!isGlobal && !path.endsWith('.html')) {
      for (const selector of css.matchAll(/([^{}]+)\{/g)) {
        const names = [...selector[1].matchAll(/\.([A-Za-z0-9_-]+)/g)].map((match) => match[1]);
        total += names.filter((name) => FORBIDDEN_CLASSES.includes(name) || SHARED_BLOCKS.includes(name)).length;
      }
    }
  }
  return total;
}

async function scan(fs: Fs): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const root of ROOTS) {
    for (const path of walk(fs, root).sort()) {
      const count = countViolations(path, fs.readFileSync(path, 'utf8'));
      if (count > 0) counts[path] = count;
    }
  }
  return counts;
}

describe('ui-guard (catraca de estilos)', () => {
  it('detecta cor literal, font-size literal e classe proibida, e ignora tokens', () => {
    expect(countViolations('a.css', '.x { color: #fff; background: rgba(0, 0, 0, .4); font-size: 0.8rem; }')).toBe(3);
    expect(countViolations('a.css', ':host { --tone: #2f8a5b; font-size: var(--font-size-md); }')).toBe(0);
    expect(countViolations('a.css', '.metric-card { padding: 0 } .page-summary__item { gap: 0 }')).toBe(1);
    expect(countViolations('src/styles.css', '.page-summary { margin: 0 }')).toBe(0);
    expect(countViolations('a.html', '<p style="color: #123456; font-size: 12px"></p>')).toBe(2);
    expect(countViolations('a.ts', 'styles: [`.a { font-size: 1rem; }`]')).toBe(1);
  });

  it('nao deixa a divida crescer nem a baseline ficar desatualizada', async () => {
    const fs = await loadFs();
    const counts = await scan(fs);
    expect(Object.keys(counts).length).toBeGreaterThan(0);
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as Record<string, number>;
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

    const grew = Object.entries(counts).filter(([path, count]) => count > (baseline[path] ?? 0));
    if ((env['UI_GUARD_UPDATE'] === 'init') || (env['UI_GUARD_UPDATE'] === '1' && grew.length === 0)) {
      fs.writeFileSync(BASELINE_PATH, JSON.stringify(counts, null, 2) + '\n');
      return;
    }
    const problems = [
      ...grew.map(([path, count]) => `${path}: ${count} violações, a baseline permite ${baseline[path] ?? 0}. Troque por token ou bloco compartilhado.`),
      ...Object.entries(baseline)
        .filter(([path, allowed]) => !grew.some(([grown]) => grown === path) && (counts[path] ?? 0) < allowed)
        .map(([path, allowed]) => `${path}: baseline ${allowed}, hoje ${counts[path] ?? 0}. Reduza a baseline (UI_GUARD_UPDATE=1).`)
    ];
    expect(problems).toEqual([]);
  });
});
