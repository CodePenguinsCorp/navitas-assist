import { computed, signal } from '@angular/core';
import { Observable } from 'rxjs';

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

/**
 * Sugestões de um campo de texto livre: as iniciais somadas às já usadas, que só são buscadas na primeira vez que o
 * campo ganha foco (uma tentativa por abertura; se falhar, tenta de novo no próximo foco).
 */
export function lazySuggestions(initial: readonly string[], fetchUsed: () => Observable<string[]>) {
  const used = signal<readonly string[]>([]);
  let requested = false;
  return {
    list: computed(() => mergeSuggestions(initial, used())),
    load(): void {
      if (requested) return;
      requested = true;
      fetchUsed().subscribe({ next: values => used.set(values), error: () => { requested = false; } });
    },
    reset(): void { requested = false; }
  };
}
