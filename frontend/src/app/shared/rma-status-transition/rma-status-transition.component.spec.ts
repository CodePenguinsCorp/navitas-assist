import { TestBed } from '@angular/core/testing';
import { RmaStatus } from '../../core/models';
import { RmaStatusTransitionComponent } from './rma-status-transition.component';

function render(inputs: { status: RmaStatus; previous?: RmaStatus | null; initial?: boolean; compact?: boolean }) {
  const fixture = TestBed.createComponent(RmaStatusTransitionComponent);
  fixture.componentRef.setInput('status', inputs.status);
  fixture.componentRef.setInput('previous', inputs.previous ?? null);
  fixture.componentRef.setInput('initial', inputs.initial ?? false);
  if (inputs.compact) fixture.componentRef.setInput('compact', true);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}
const chips = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.status-chip')];

describe('RmaStatusTransitionComponent', () => {
  it('mostra o par de chips com a palavra para entre eles e leitura acessível completa', () => {
    const root = render({ status: 'IN_DIAGNOSIS', previous: 'RECEIVED' });
    expect(chips(root).map(chip => [chip.dataset['status'], chip.textContent?.trim()])).toEqual([['RECEIVED', 'Recebida'], ['IN_DIAGNOSIS', 'Diagnóstico']]);
    expect(root.querySelector('.status-transition__word')?.textContent?.trim()).toBe('para');
    expect(root.querySelector('.sr-only')?.textContent?.trim()).toBe('Status alterado de Recebida para Diagnóstico');
    expect(root.querySelector('.status-transition__visual')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('mostra Status inicial com um chip único no primeiro registro', () => {
    const root = render({ status: 'RECEIVED', initial: true });
    expect(chips(root)).toHaveLength(1);
    expect(root.textContent).toContain('Status inicial');
    expect(root.querySelector('.sr-only')?.textContent?.trim()).toBe('Status inicial: Recebida');
  });

  it('mostra Status registrado com chip único quando o status não mudou ou o anterior é desconhecido', () => {
    for (const previous of ['TRIAGE', null] as const) {
      const root = render({ status: 'TRIAGE', previous });
      expect(chips(root)).toHaveLength(1);
      expect(root.textContent).toContain('Status registrado');
      expect(root.querySelector('.sr-only')?.textContent?.trim()).toBe('Status registrado: Triagem');
    }
  });

  it('aceita a versão compacta', () => {
    const root = render({ status: 'TRIAGE', previous: 'RECEIVED', compact: true });
    expect(root.querySelector('.status-transition--compact')).not.toBeNull();
  });
});
