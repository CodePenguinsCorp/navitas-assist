import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormArray, FormGroup } from '@angular/forms';
import { Subject, of } from 'rxjs';
import { ProtocolTemplateItemResponse, ProtocolTemplateResponse } from '../../core/models';
import { CatalogService } from '../../core/services/catalog.service';
import { ProtocolService } from '../../core/services/protocol.service';
import { ProtocolsComponent } from './protocols.component';

const MEASUREMENT: ProtocolTemplateItemResponse = { id: 21, sortOrder: 1, stepName: 'Medições', title: 'Tensão', instructions: 'Medir\nna placa.', type: 'MEASUREMENT', required: true,
  unit: 'V', decimalPlaces: 6, minValue: -0.000125, maxValue: 12.5, expectedResult: 'Fonte\nestável', evidenceRequired: true };
const TEMPLATE: ProtocolTemplateResponse = { id: 2, name: 'Bancada PWM', productId: null, productName: null, category: 'Placas', active: true, currentVersion: 3,
  blockedStatuses: ['IN_TESTS'], updatedAt: '2026-10-20T12:00:00Z', items: [MEASUREMENT,
    { ...MEASUREMENT, id: 22, sortOrder: 2, stepName: 'Inspeção', title: 'Conector', type: 'CHECK', required: false, evidenceRequired: false, unit: null, decimalPlaces: null, minValue: null, maxValue: null },
    { ...MEASUREMENT, id: 23, sortOrder: 3, stepName: 'Final', title: 'Observação', type: 'TEXT', unit: null, decimalPlaces: null, minValue: null, maxValue: null }]
};
type Harness = { form: FormGroup & { controls: FormGroup['controls'] & { items: FormArray<FormGroup> } }; openEditModal(template: ProtocolTemplateResponse): void;
  openCreateModal(): void; closeModal(): void; addItem(): void; removeItem(index: number): void; saveTemplate(): void; selectItem(item: FormGroup): void };

describe('ProtocolsComponent focused items', () => {
  let fixture: ComponentFixture<ProtocolsComponent>;
  let updateTemplate: ReturnType<typeof vi.fn>;
  const component = () => fixture.componentInstance as unknown as Harness;
  const render = () => { fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck(); fixture.detectChanges(); };
  const stable = async () => { render(); await fixture.whenStable(); };
  const panel = () => fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
  const summaries = () => Array.from<HTMLButtonElement>(panel().querySelectorAll('button.protocol-item-summary'));
  const title = () => panel().querySelector<HTMLInputElement>('[formcontrolname="title"]')!;
  const items = () => component().form.controls.items;
  const button = (text: string) => Array.from<HTMLButtonElement>(panel().querySelectorAll('button')).find((b) => b.textContent?.trim() === text)!;
  async function setup() {
    updateTemplate = vi.fn(() => of({ ...TEMPLATE, currentVersion: 4 }));
    await TestBed.configureTestingModule({ imports: [ProtocolsComponent], providers: [
      { provide: ProtocolService, useValue: { listTemplates: () => of([TEMPLATE]), updateTemplate, createTemplate: vi.fn(() => of(TEMPLATE)) } },
      { provide: CatalogService, useValue: { listProductOptions: () => of([]) } }
    ] }).compileComponents();
    fixture = TestBed.createComponent(ProtocolsComponent); render(); component().openEditModal(TEMPLATE); await stable();
  }
  function inputValue(name: string, value: string) {
    const input = panel().querySelector<HTMLInputElement | HTMLTextAreaElement>(`[formcontrolname="${name}"]`)!;
    input.value = value; input.dispatchEvent(new Event('input')); render();
  }

  // Vermelho: três editores ficam montados em vez de um editor e três resumos selecionáveis.
  it('summarizes every item while editing only the selected one', async () => {
    await setup(); expect(panel().querySelectorAll('[formcontrolname="title"]')).toHaveLength(1);
    expect(summaries()).toHaveLength(3);
    for (const [index, summary] of summaries().entries()) {
      expect(summary.textContent).toContain(`Item ${index + 1}`); expect(summary.textContent).toContain(TEMPLATE.items[index].stepName);
      expect(summary.textContent).toContain(TEMPLATE.items[index].title); expect(summary.getAttribute('aria-expanded')).toBe(String(index === 0));
      expect(summary.getAttribute('aria-controls')).toBe(`protocol-item-editor-${index}`);
    }
    expect(summaries()[0].textContent).toContain('Medição'); expect(summaries()[0].textContent).toContain('Obrigatório'); expect(summaries()[0].textContent).toContain('Exige evidência');
    expect(summaries()[1].textContent).toContain('Verificação'); expect(summaries()[1].textContent).toContain('Opcional');
    expect(summaries()[1].textContent).not.toContain('Exige evidência'); expect(summaries()[2].textContent).toContain('Texto');
    expect(panel().querySelector('#' + summaries()[0].getAttribute('aria-controls'))).not.toBeNull();
  });

  // Vermelho: faltam os resumos para alternar o editor; os valores/payload do FormArray já são preservação.
  it('switches items without losing unsaved fields or order', async () => {
    await setup(); expect(summaries()).toHaveLength(3);
    inputValue('title', 'Tensão alterada'); inputValue('instructions', 'Primeira linha\nSegunda linha'); inputValue('minValue', '-0,000125');
    expect(summaries()[0].textContent).toContain('Tensão alterada');
    summaries()[2].click(); render(); expect(title().value).toBe('Observação'); inputValue('title', 'Observação alterada');
    summaries()[0].click(); render(); expect(title().value).toBe('Tensão alterada');
    expect(panel().querySelector<HTMLTextAreaElement>('[formcontrolname="instructions"]')!.value).toBe('Primeira linha\nSegunda linha');
    component().saveTemplate();
    expect(updateTemplate).toHaveBeenCalledWith(2, { name: 'Bancada PWM', productId: null, category: 'Placas', active: true, blockedStatuses: ['IN_TESTS'], items: [
      { stepName: 'Medições', title: 'Tensão alterada', instructions: 'Primeira linha\nSegunda linha', type: 'MEASUREMENT', required: true, unit: 'V', decimalPlaces: 6,
        minValue: '-0.000125', maxValue: '12.5', expectedResult: 'Fonte\nestável', evidenceRequired: true },
      { stepName: 'Inspeção', title: 'Conector', instructions: 'Medir\nna placa.', type: 'CHECK', required: false, unit: null, decimalPlaces: null, minValue: null, maxValue: null, expectedResult: 'Fonte\nestável', evidenceRequired: false },
      { stepName: 'Final', title: 'Observação alterada', instructions: 'Medir\nna placa.', type: 'TEXT', required: true, unit: null, decimalPlaces: null, minValue: null, maxValue: null, expectedResult: 'Fonte\nestável', evidenceRequired: true }
    ] });
  });

  // Vermelho: Adicionar deixa o primeiro editor como o primeiro campo visível, sem selecionar o novo.
  it('adds and removes items without a stale selection and focuses the neighbour summary', async () => {
    await setup(); component().addItem(); await stable(); expect(title().value).toBe('');
    items().at(3).patchValue({ stepName: 'Final', title: 'Novo' }); render();
    component().removeItem(3); await stable(); expect(title().value).toBe('Observação'); expect(document.activeElement).toBe(summaries()[2]);
    const selected = items().at(2); component().removeItem(0); await stable();
    expect(items().at(1)).toBe(selected); expect(title().value).toBe('Observação'); expect(summaries()[1].getAttribute('aria-expanded')).toBe('true');
    component().removeItem(1); await stable(); expect(title().value).toBe('Conector'); expect(document.activeElement).toBe(summaries()[0]);
    component().removeItem(0); render(); expect(items().length).toBe(1);
    expect(panel().querySelector<HTMLButtonElement>('[aria-label="Remover item 1"]')?.disabled).toBe(true);
  });

  // Vermelho: publicar inválido não foca o título nem revela uma seleção específica do item inválido.
  it('reveals a non selected invalid item before refusing publication', async () => {
    await setup(); items().at(0).controls['title'].setValue(''); render(); summaries()[1]?.click(); render();
    component().saveTemplate(); await stable();
    expect(document.activeElement).toBe(title());
    expect(summaries()[0].getAttribute('aria-expanded')).toBe('true');
    expect(title().closest('label')?.querySelector('.field-error')?.textContent?.trim()).toBe('Informe o item.');
    expect(updateTemplate).not.toHaveBeenCalled(); expect(items().at(0).enabled).toBe(true);
  });

  // Vermelho: esperado e instruções são inputs de uma linha.
  it('provides multiline instructions and expected result with the existing limits', async () => {
    await setup();
    for (const [name, max] of [['instructions', 1000], ['expectedResult', 500]] as const) {
      const input = panel().querySelector<HTMLTextAreaElement>(`[formcontrolname="${name}"]`)!;
      expect(input.tagName).toBe('TEXTAREA'); expect(input.getAttribute('rows')).toBe('3'); expect(input.getAttribute('maxlength')).toBe(String(max));
    }
    inputValue('instructions', ' Linha 1\nLinha 2 '); inputValue('expectedResult', ' Esperado 1\nEsperado 2 '); component().saveTemplate();
    expect(updateTemplate.mock.calls[0][1].items[0]).toEqual(expect.objectContaining({ instructions: 'Linha 1\nLinha 2', expectedResult: 'Esperado 1\nEsperado 2' }));
  });

  // Vermelho: Adicionar e Remover ficam habilitados e não respeitam publicação pendente.
  it('does not change selection or items while publication is pending and recovers on error', async () => {
    await setup(); const pending = new Subject<ProtocolTemplateResponse>(); updateTemplate.mockReturnValueOnce(pending);
    component().saveTemplate(); render();
    expect(button('Adicionar item').disabled).toBe(true);
    expect(summaries().every((b) => b.disabled)).toBe(true);
    expect(Array.from<HTMLButtonElement>(panel().querySelectorAll('[aria-label^="Remover item"]')).every((b) => b.disabled)).toBe(true);
    component().selectItem(items().at(2)); component().addItem(); component().removeItem(0); render();
    expect(items().length).toBe(3); expect(title().value).toBe('Tensão');
    pending.error({ error: { message: 'Versão recusada.' } }); render();
    expect(title().value).toBe('Tensão'); expect(summaries()[0].getAttribute('aria-expanded')).toBe('true'); expect(button('Adicionar item').disabled).toBe(false);
    summaries()[2].click(); render(); expect(title().value).toBe('Observação'); component().saveTemplate(); render();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    component().openEditModal(TEMPLATE); await stable(); expect(title().value).toBe('Tensão'); expect(summaries()[0].getAttribute('aria-expanded')).toBe('true');
    component().closeModal(); component().openCreateModal(); await stable(); expect(title().value).toBe(''); expect(summaries()).toHaveLength(1);
  });

  it('preserves hidden measurement validators and does not silently clear invalid values', async () => {
    await setup(); items().at(0).patchValue({ minValue: 'inválido', type: 'CHECK' }); render(); component().saveTemplate(); render();
    expect(updateTemplate).not.toHaveBeenCalled(); expect(items().at(0).controls['minValue'].value).toBe('inválido');
    expect(panel().textContent).toContain('Revise os campos e informe o produto ou a categoria do protocolo.');
  });

  it.each([0, 6])('preserves measurement precision %s and non measurement null extras', async (places) => {
    await setup(); items().at(0).patchValue({ decimalPlaces: places, minValue: '-1,25', maxValue: '-2,5' }); component().saveTemplate();
    const payload = updateTemplate.mock.calls[0][1];
    expect(payload.items).toHaveLength(3); expect(payload.items[0]).toEqual(expect.objectContaining({ decimalPlaces: places, minValue: '-1.25', maxValue: '-2.5' }));
    expect(payload.items[1]).toEqual(expect.objectContaining({ unit: null, decimalPlaces: null, minValue: null, maxValue: null }));
  });
});
