import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { RmaService } from '../../core/services/rma.service';
import { buildRma } from '../../testing/rma-fixtures';
import { providePermissions } from '../../testing/permission-fixtures';
import { RmaStatusFieldComponent } from '../rma-status-field/rma-status-field.component';
import { RmaHistoryListComponent } from './rma-history-list.component';

const history = (count: number, id = 1) => buildRma({ id, status: 'TRIAGE', statusHistory: Array.from({ length: count }, (_, i) => ({
  id: i + 1, status: 'TRIAGE', changedBy: `Pessoa ${i + 1}`, changedAt: `2026-11-14T10:${String(i).padStart(2, '0')}:00Z`, note: `Nota ${i + 1}`
})) });
@Component({
  imports: [RmaHistoryListComponent, RmaStatusFieldComponent],
  template: `<app-rma-history-list #list="rmaHistoryList" [rma]="rma()" [showHeading]="true">
    <ol>@for (entry of list.entries(); track $index) { <li>{{ entry.by }}
      @if (entry.kind === 'status') { <app-rma-status-field [rma]="rma()" [event]="entry.event" [showSelector]="false" (saved)="rma.set($event)" /> }
    </li> }</ol>
  </app-rma-history-list>`
})
class Host { readonly rma = signal(history(12)); }

describe('Histórico com Ver mais', () => {
  const save = vi.fn();
  async function setup(count = 12) {
    save.mockImplementation((_id: number, eventId: number, note: string) => of(buildRma({ ...history(count), statusHistory: history(count).statusHistory.map(e => e.id === eventId ? { ...e, note } : e) })));
    await TestBed.configureTestingModule({ imports: [Host], providers: [providePermissions(['rma.status']), { provide: RmaService, useValue: { updateStatusNote: save } }] }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.rma.set(history(count));
    const render = () => { fixture.detectChanges(); TestBed.tick(); };
    render();
    const root = fixture.nativeElement as HTMLElement;
    const button = (text: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === text)!;
    return { fixture, root, render, button };
  }
  it('mostra as cinco mais recentes, total e sete restantes em doze entradas', async () => {
    const { root, button } = await setup();
    expect(root.querySelectorAll('li')).toHaveLength(5);
    expect(root.querySelector('li')?.textContent).toContain('Pessoa 12');
    expect(root.querySelector('h3')?.textContent).toContain('12');
    expect(button('Ver mais (7 restantes)')).toBeDefined();
  });
  it('revela até dez por clique, anuncia a contagem e foca a primeira entrada nova', async () => {
    const { root, render, button } = await setup(27);
    button('Ver mais (22 restantes)').click(); render();
    expect(root.querySelectorAll('li')).toHaveLength(15);
    expect(document.activeElement).toBe(root.querySelectorAll('li')[5]);
    expect(root.querySelector('[aria-live="polite"]')?.textContent).toContain('15 entradas exibidas');
    button('Ver mais (12 restantes)').click(); render();
    expect(root.querySelectorAll('li')).toHaveLength(25);
    button('Ver mais (2 restantes)').click(); render();
    expect(root.querySelectorAll('li')).toHaveLength(27);
    expect(document.activeElement).toBe(root.querySelectorAll('li')[25]);
    expect(root.querySelector('[aria-live="polite"]')?.textContent).toContain('27 entradas exibidas');
    expect(root.textContent).not.toContain('Ver mais');
  });
  it('revela o total de doze e remove o botão', async () => {
    const { root, render, button } = await setup();
    button('Ver mais (7 restantes)').click(); render();
    expect(root.querySelectorAll('li')).toHaveLength(12);
    expect(root.textContent).not.toContain('Ver mais');
  });
  for (const count of [0, 3, 5]) it(`não oferece Ver mais com ${count} entradas`, async () => {
    const { root } = await setup(count);
    expect(root.querySelectorAll('li')).toHaveLength(count);
    expect(root.textContent).not.toContain('Ver mais');
    expect(root.querySelector('h3')).toBeNull();
  });
  it('reinicia ao trocar de OS e preserva a expansão ao atualizar a mesma OS', async () => {
    const { fixture, root, render, button } = await setup();
    button('Ver mais (7 restantes)').click(); render();
    fixture.componentInstance.rma.set({ ...history(12) }); render();
    expect(root.querySelectorAll('li')).toHaveLength(12);
    fixture.componentInstance.rma.set(history(12, 2)); render();
    expect(root.querySelectorAll('li')).toHaveLength(5);
  });
  it('salva observação de uma entrada revelada sem recolher a lista', async () => {
    const { root, render, button } = await setup();
    button('Ver mais (7 restantes)').click(); render();
    const entry = root.querySelectorAll('li')[5];
    (entry.querySelector('button') as HTMLButtonElement).click(); render();
    const textarea = entry.querySelector('textarea')!;
    textarea.value = 'Observação atualizada'; textarea.dispatchEvent(new Event('input'));
    button('Salvar').click(); render();
    expect(save).toHaveBeenCalledWith(1, 7, 'Observação atualizada');
    expect(root.querySelectorAll('li')).toHaveLength(12);
    expect(root.querySelectorAll('li')[5].textContent).toContain('Observação atualizada');
  });
});
