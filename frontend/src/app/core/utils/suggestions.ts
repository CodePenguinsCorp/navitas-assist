const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR').trim();

/** Sugestões iniciais somadas às já usadas, sem repetir o mesmo texto (sem diferenciar maiúsculas nem acentos). */
export function mergeSuggestions(initial: readonly string[], used: readonly string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const value of [...initial, ...used]) {
    const key = normalize(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(value.trim());
  }
  return merged.sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
}
