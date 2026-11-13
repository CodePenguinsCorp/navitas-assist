import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { RmaResponse, WarrantyStatus } from '../../core/models';
import { RmaService } from '../../core/services/rma.service';
import { buildRma, buildRmaItem } from '../../testing/rma-fixtures';
import { RmaWarrantyFieldComponent } from './rma-warranty-field.component';

const item = buildRmaItem({ id: 9, warrantyStatus: WarrantyStatus.IN_WARRANTY, calculatedWarrantyStatus: WarrantyStatus.OUT_OF_WARRANTY,
  warrantyOverride: { status: WarrantyStatus.IN_WARRANTY, reason: 'Cortesia', changedBy: 'ana', changedAt: '2026-11-13T12:00:00Z' } });
const rma = buildRma({ id: 4, items: [item] });

describe('RmaWarrantyFieldComponent', () => {
  let fixture: ComponentFixture<RmaWarrantyFieldComponent>;
  let response: () => ReturnType<RmaService['updateWarranty']>;
  let calls: unknown[][];
  let saved: RmaResponse[];
  beforeEach(async () => {
    calls = []; saved = []; response = () => of(rma);
    await TestBed.configureTestingModule({ imports: [RmaWarrantyFieldComponent], providers: [
      { provide: RmaService, useValue: { updateWarranty: (...args: unknown[]) => { calls.push(args); return response(); } } }
    ] }).compileComponents();
  });
  const host = () => fixture.nativeElement as HTMLElement;
  const render = () => { fixture.detectChanges(); TestBed.tick(); };
  const text = () => host().textContent ?? '';
  const trigger = () => host().querySelector<HTMLButtonElement>('.warranty-field__trigger');
  const button = (label: string) => [...host().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label)!;
  function mount(options: { canEdit?: boolean; disabled?: boolean; status?: RmaResponse['status']; legacy?: boolean } = {}) {
    fixture = TestBed.createComponent(RmaWarrantyFieldComponent);
    fixture.componentRef.setInput('rma', { ...rma, status: options.status ?? rma.status });
    fixture.componentRef.setInput('item', options.legacy ? { ...item, id: null } : item);
    fixture.componentRef.setInput('canEdit', options.canEdit ?? true);
    fixture.componentRef.setInput('disabled', options.disabled ?? false);
    fixture.componentInstance.saved.subscribe((value) => saved.push(value));
    render();
  }
  function edit() { trigger()!.click(); render(); }
  function choose(label: string) {
    host().querySelector<HTMLButtonElement>('.custom-select__trigger')!.click(); render();
    [...host().querySelectorAll<HTMLButtonElement>('[role="option"]')].find((b) => b.textContent?.includes(label))!.click(); render();
  }
  function reason(value: string) {
    const input = host().querySelector<HTMLTextAreaElement>('textarea')!;
    input.value = value; input.dispatchEvent(new Event('input')); render();
  }
  function submit() { host().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true })); render(); }

  it('mostra a efetiva, o marcador com dica acessível e a automática divergente', () => {
    mount();
    expect(trigger()!.textContent).toContain('Em garantia');
    expect(text()).toContain('Automático: Fora de garantia');
    const marker = host().querySelector<HTMLElement>('.warranty-field__manual')!;
    expect(marker.textContent).toContain('Ajustada manualmente');
    marker.focus(); render();
    const tooltip = host().querySelector('[role="tooltip"]')!;
    expect(tooltip.textContent).toContain('Cortesia');
    expect(tooltip.textContent).toContain('ana');
    expect(tooltip.textContent).toContain('13/11/2026');
    expect(marker.getAttribute('aria-describedby')).toBe(tooltip.id);
  });
  it('omite a automática quando não diverge', () => {
    mount(); fixture.componentRef.setInput('item', { ...item, calculatedWarrantyStatus: item.warrantyStatus }); render();
    expect(text()).not.toContain('Automático:');
  });
  it('sem permissão mostra o valor sem permitir edição', () => {
    mount({ canEdit: false }); expect(trigger()).toBeNull(); expect(host().querySelector('form')).toBeNull();
  });
  it.each(['COMPLETED', 'RETURNED', 'IRREPARABLE'] as const)('bloqueia RMA encerrado %s', (status) => {
    mount({ status }); expect(trigger()?.disabled ?? true).toBe(true);
  });
  it('bloqueia readonly e item legado sem id', () => {
    mount({ disabled: true }); expect(trigger()!.disabled).toBe(true);
    fixture.componentRef.setInput('disabled', false); fixture.componentRef.setInput('item', { ...item, id: null }); render();
    expect(trigger()?.disabled ?? true).toBe(true);
  });
  it('inicia sem ajuste em Automático e esconde o motivo', () => {
    mount(); fixture.componentRef.setInput('item', { ...item, warrantyOverride: null, warrantyStatus: WarrantyStatus.PENDING, calculatedWarrantyStatus: WarrantyStatus.PENDING }); render();
    expect(text()).not.toContain('Ajustada manualmente'); edit();
    expect(host().querySelector('.custom-select__trigger')!.textContent).toContain('Automático');
    expect(host().querySelector('textarea')).toBeNull(); choose('Em garantia');
    expect(host().querySelector('textarea')!.value).toBe(''); reason('Cortesia'); submit();
    expect(calls).toEqual([[4, 9, { override: WarrantyStatus.IN_WARRANTY, reason: 'Cortesia' }]]);
  });
  it('abre inline com seletor e motivo atual, cancelar à esquerda e salvar à direita', () => {
    mount(); edit();
    expect(host().querySelector('app-custom-select')).not.toBeNull();
    expect(host().querySelector('textarea')!.value).toBe('Cortesia');
    expect([...host().querySelectorAll('.warranty-field__actions button')].map((b) => b.textContent?.trim())).toEqual(['Cancelar', 'Salvar']);
  });
  it('exige motivo não vazio e limita a 255 caracteres', () => {
    mount(); edit(); reason('   '); submit(); expect(calls).toEqual([]);
    expect(host().querySelector('[role="alert"]')).not.toBeNull();
    reason('x'.repeat(256)); submit(); expect(calls).toEqual([]);
    expect(host().querySelector('textarea')!.maxLength).toBe(255);
  });
  it.each(['Sem NF', 'Cortesia', 'Mau uso', 'Cliente estratégico'])('permite o atalho %s e texto livre', (shortcut) => {
    mount(); edit(); button(shortcut).click(); render();
    expect(host().querySelector('textarea')!.value).toBe(shortcut);
    reason(shortcut + ' aprovado'); submit();
    expect(calls).toEqual([[4, 9, { override: WarrantyStatus.IN_WARRANTY, reason: shortcut + ' aprovado' }]]);
    expect(saved).toEqual([rma]); expect(host().querySelector('form')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });
  it('automático esconde o motivo e salva null para remover o ajuste', () => {
    mount(); edit(); choose('Automático');
    expect(host().querySelector('textarea')).toBeNull(); expect(button('Sem NF')).toBeUndefined();
    submit(); expect(calls).toEqual([[4, 9, { override: null, reason: null }]]);
  });
  it('salva fora de garantia com motivo aparado', () => {
    mount(); edit(); choose('Fora de garantia'); reason('  Mau uso  '); submit();
    expect(calls).toEqual([[4, 9, { override: WarrantyStatus.OUT_OF_WARRANTY, reason: 'Mau uso' }]]);
  });
  it('cancelar e Escape descartam sem requisição e devolvem o foco', () => {
    mount(); edit(); reason('Outro'); button('Cancelar').click(); render();
    expect(document.activeElement).toBe(trigger()); edit();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    host().querySelector('textarea')!.dispatchEvent(event); render();
    expect(event.defaultPrevented).toBe(true); expect(host().querySelector('form')).toBeNull(); expect(calls).toEqual([]);
  });
  it('mostra erro do backend inline e mantém os valores para tentar novamente', () => {
    response = () => throwError(() => ({ error: { message: 'RMA encerrado.' } }));
    mount(); edit(); reason('Outro'); submit();
    expect(host().querySelector('[role="alert"]')!.textContent).toContain('RMA encerrado.');
    expect(host().querySelector('textarea')!.value).toBe('Outro'); expect(saved).toEqual([]);
  });
  it('usa mensagem de erro padrão quando o backend não informa o motivo', () => {
    response = () => throwError(() => ({})); mount(); edit(); reason('Outro'); submit();
    expect(host().querySelector('[role="alert"]')!.textContent).toContain('Não foi possível salvar a garantia.');
  });
  it('bloqueia gravações duplicadas, cancelamento e controles enquanto salva', () => {
    const pending = new Subject<RmaResponse>(); response = () => pending;
    mount(); edit(); reason('Outro'); submit(); submit();
    expect(calls).toHaveLength(1); expect(button('Cancelar').disabled).toBe(true);
    expect(host().querySelector('textarea')!.disabled).toBe(true);
    expect(host().querySelector<HTMLButtonElement>('.custom-select__trigger')!.disabled).toBe(true);
    pending.next(rma); pending.complete(); render(); expect(saved).toEqual([rma]);
  });
  it('revalida permissão e disabled antes de salvar uma edição já aberta', () => {
    mount(); edit(); reason('Outro'); fixture.componentRef.setInput('disabled', true); render(); submit();
    expect(calls).toEqual([]);
  });
});
