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
  openCreateModal(): void; closeModal(): void; addItem(): void; removeItem(index: number): void; saveTemplate(): void; toggleItem(item: FormGroup): void; toggleAllItems(): void };

describe('ProtocolsComponent focused items', () => {
  let fixture: ComponentFixture<ProtocolsComponent>;
  let updateTemplate: ReturnType<typeof vi.fn>;
  const component = () => fixture.componentInstance as unknown as Harness;
  const render = () => { fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck(); fixture.detectChanges(); };
  const stable = async () => { render(); await fixture.whenStable(); };
  const panel = () => fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
  const summaries = () => Array.from<HTMLButtonElement>(panel().querySelectorAll('button.protocol-item-summary'));
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

  const editorOf = (index: number) => panel().querySelector<HTMLElement>(`#protocol-item-editor-${index}`);
  const titleOf = (index: number) => editorOf(index)!.querySelector<HTMLInputElement>('[formcontrolname="title"]')!;
  const expanded = () => summaries().map((summary) => summary.getAttribute('aria-expanded'));
  const open = (index: number) => { if (summaries()[index].getAttribute('aria-expanded') !== 'true') { summaries()[index].click(); render(); } };
  function inputOf(index: number, name: string, value: string) {
    const input = editorOf(index)!.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[formcontrolname="${name}"]`)!;
    input.value = value; input.dispatchEvent(new Event('input')); render();
  }

  it('starts a new version with every item collapsed and summarized', async () => {
    await setup(); expect(panel().querySelectorAll('[formcontrolname="title"]')).toHaveLength(0);
    expect(summaries()).toHaveLength(3); expect(expanded()).toEqual(['false', 'false', 'false']);
    for (const [index, summary] of summaries().entries()) {
      expect(summary.textContent).toContain(`Item ${index + 1}`); expect(summary.textContent).toContain(TEMPLATE.items[index].stepName);
      expect(summary.textContent).toContain(TEMPLATE.items[index].title);
      expect(summary.getAttribute('aria-controls')).toBe(`protocol-item-editor-${index}`);
    }
    expect(summaries()[0].textContent).toContain('Medição'); expect(summaries()[0].textContent).toContain('Obrigatório'); expect(summaries()[0].textContent).toContain('Exige evidência');
    expect(summaries()[1].textContent).toContain('Verificação'); expect(summaries()[1].textContent).toContain('Opcional');
    expect(summaries()[1].textContent).not.toContain('Exige evidência'); expect(summaries()[2].textContent).toContain('Anotação');
    open(0);
    expect(panel().querySelector('#' + summaries()[0].getAttribute('aria-controls'))).not.toBeNull();
  });

  it('opens items independently without losing unsaved fields or order', async () => {
    await setup(); open(0);
    inputOf(0, 'title', 'Tensão alterada'); inputOf(0, 'instructions', 'Primeira linha\nSegunda linha'); inputOf(0, 'minValue', '-0,000125');
    expect(summaries()[0].textContent).toContain('Tensão alterada');
    open(2); expect(expanded()).toEqual(['true', 'false', 'true']);
    expect(titleOf(2).value).toBe('Observação'); inputOf(2, 'title', 'Observação alterada');
    summaries()[0].click(); render(); expect(editorOf(0)).toBeNull();
    open(0); expect(titleOf(0).value).toBe('Tensão alterada');
    expect(editorOf(0)!.querySelector<HTMLTextAreaElement>('[formcontrolname="instructions"]')!.value).toBe('Primeira linha\nSegunda linha');
    component().saveTemplate();
    expect(updateTemplate).toHaveBeenCalledWith(2, { name: 'Bancada PWM', productId: null, category: 'Placas', active: true, blockedStatuses: ['IN_TESTS'], items: [
      { stepName: 'Medições', title: 'Tensão alterada', instructions: 'Primeira linha\nSegunda linha', type: 'MEASUREMENT', required: true, unit: 'V', decimalPlaces: 6,
        minValue: '-0.000125', maxValue: '12.5', expectedResult: 'Fonte\nestável', evidenceRequired: true },
      { stepName: 'Inspeção', title: 'Conector', instructions: 'Medir\nna placa.', type: 'CHECK', required: false, unit: null, decimalPlaces: null, minValue: null, maxValue: null, expectedResult: 'Fonte\nestável', evidenceRequired: false },
      { stepName: 'Final', title: 'Observação alterada', instructions: 'Medir\nna placa.', type: 'TEXT', required: true, unit: null, decimalPlaces: null, minValue: null, maxValue: null, expectedResult: 'Fonte\nestável', evidenceRequired: true }
    ] });
  });

  it('opens a new item collapsing the others, removes items and focuses the neighbour summary', async () => {
    await setup(); open(0); component().addItem(); await stable();
    expect(expanded()).toEqual(['false', 'false', 'false', 'true']); expect(titleOf(3).value).toBe('');
    items().at(3).patchValue({ stepName: 'Final', title: 'Novo' }); render();
    component().removeItem(3); await stable(); expect(document.activeElement).toBe(summaries()[2]);
    open(2); const opened = items().at(2); component().removeItem(0); await stable();
    expect(items().at(1)).toBe(opened); expect(titleOf(1).value).toBe('Observação'); expect(expanded()).toEqual(['false', 'true']);
    expect(document.activeElement).toBe(summaries()[0]);
    component().removeItem(1); await stable(); expect(document.activeElement).toBe(summaries()[0]); expect(expanded()).toEqual(['false']);
    component().removeItem(0); render(); expect(items().length).toBe(1);
    expect(panel().querySelector<HTMLButtonElement>('[aria-label="Remover item 1"]')?.getAttribute('aria-disabled')).toBe('true');
  });

  it('collapses and expands every item from the list header', async () => {
    await setup();
    button('Expandir todos').click(); render();
    expect(expanded()).toEqual(['true', 'true', 'true']); expect(panel().querySelectorAll('.protocol-item-card')).toHaveLength(3);
    button('Recolher todos').click(); render();
    expect(expanded()).toEqual(['false', 'false', 'false']); expect(panel().querySelector('.protocol-item-card')).toBeNull();
    open(1); expect(button('Recolher todos')).toBeDefined();
    component().closeModal(); component().openCreateModal(); await stable();
    expect(button('Expandir todos')).toBeUndefined(); expect(button('Recolher todos')).toBeUndefined();
  });

  const rows = () => Array.from<HTMLElement>(panel().querySelectorAll('.protocol-item-summary-row'));
  const removeButton = (n: number) => panel().querySelector<HTMLButtonElement>(`[aria-label="Remover item ${n}"]`)!;
  const chips = (row: HTMLElement) => Array.from(row.querySelectorAll('.item-row__chip')).map((chip) => chip.textContent?.trim());

  // Vermelho: o resumo é um bloco de quatro linhas de texto, sem selo, chips nem X.
  it('renders each item as a compact row with number badge, title, chips and an X sibling', async () => {
    await setup(); expect(rows()).toHaveLength(3);
    for (const [index, row] of rows().entries()) {
      expect(row.querySelector('.item-row__badge')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(`Item ${index + 1}`);
      expect(row.querySelector('.item-row__title')?.textContent?.trim()).toBe(TEMPLATE.items[index].title);
      const remove = removeButton(index + 1);
      expect(row.contains(remove)).toBe(true); expect(summaries()[index].contains(remove)).toBe(false);
      expect(remove.classList).toContain('icon-button--danger'); expect(remove.querySelector('svg')).not.toBeNull();
      expect(summaries()[index].querySelector('.item-row__chevron')).not.toBeNull();
    }
    expect(chips(rows()[0])).toEqual(['Medições', 'Medição', 'Obrigatório', 'Exige evidência']);
    expect(chips(rows()[1])).toEqual(['Inspeção', 'Verificação', 'Opcional']);
    expect(chips(rows()[2])).toEqual(['Final', 'Anotação', 'Obrigatório', 'Exige evidência']);
  });

  // Vermelho: item novo mostra "Etapa: " vazio e nenhum título.
  it('names an untitled item and hides an empty step chip', async () => {
    await setup(); component().addItem(); await stable();
    expect(rows()[3].querySelector('.item-row__title')?.textContent?.trim()).toBe('Sem título');
    expect(chips(rows()[3])).toEqual(['Verificação', 'Obrigatório']);
  });

  // Vermelho: o editor fica depois de todos os resumos, desconectado do item selecionado.
  it('opens the editor inside its own item and lets every item close', async () => {
    await setup(); summaries()[1].click(); render();
    const item = summaries()[1].closest<HTMLElement>('.item-row')!;
    expect(item.classList).toContain('is-selected');
    expect(item.querySelector('#protocol-item-editor-1')).not.toBeNull();
    expect(summaries()[0].closest('.item-row')!.classList).not.toContain('is-selected');
    summaries()[1].click(); render();
    expect(item.querySelector('.protocol-item-card')).toBeNull(); expect(summaries()[1].getAttribute('aria-expanded')).toBe('false');
    expect(panel().querySelector('.protocol-item-card')).toBeNull();
  });

  // Vermelho: não existe X por item.
  it('removes the clicked item with its X and returns focus to the neighbour summary', async () => {
    await setup(); open(1);
    removeButton(3).click(); await stable();
    expect(items().length).toBe(2); expect(items().controls.map((item) => item.controls['title'].value)).toEqual(['Tensão', 'Conector']);
    expect(document.activeElement).toBe(summaries()[1]); expect(titleOf(1).value).toBe('Conector');
    removeButton(2).click(); await stable();
    expect(items().controls.map((item) => item.controls['title'].value)).toEqual(['Tensão']);
    expect(document.activeElement).toBe(summaries()[0]); expect(expanded()).toEqual(['false']);
  });

  // Vermelho: o último item não explica por que não pode ser removido.
  it('keeps the last item and explains why its X is unavailable', async () => {
    await setup(); removeButton(3).click(); await stable(); removeButton(2).click(); await stable();
    const last = removeButton(1);
    expect(last.getAttribute('aria-disabled')).toBe('true');
    const tip = panel().querySelector('#' + last.getAttribute('aria-describedby'));
    expect(tip?.textContent?.trim()).toBe('O protocolo precisa de pelo menos um item.');
    last.click(); await stable(); expect(items().length).toBe(1);
  });

  // Vermelho: publicar inválido não foca o título nem revela uma seleção específica do item inválido.
  it('reveals a non selected invalid item before refusing publication', async () => {
    await setup(); items().at(0).controls['title'].setValue(''); render(); open(1);
    component().saveTemplate(); await stable();
    expect(document.activeElement).toBe(titleOf(0));
    expect(expanded()).toEqual(['true', 'true', 'false']);
    expect(titleOf(0).closest('label')?.querySelector('.field-error')?.textContent?.trim()).toBe('Informe o item.');
    expect(updateTemplate).not.toHaveBeenCalled(); expect(items().at(0).enabled).toBe(true);
  });

  // Vermelho: esperado e instruções são inputs de uma linha.
  it('provides multiline instructions and expected result with the existing limits', async () => {
    await setup(); open(0);
    for (const [name, max] of [['instructions', 1000], ['expectedResult', 500]] as const) {
      const input = panel().querySelector<HTMLTextAreaElement>(`[formcontrolname="${name}"]`)!;
      expect(input.tagName).toBe('TEXTAREA'); expect(input.getAttribute('rows')).toBe('3'); expect(input.getAttribute('maxlength')).toBe(String(max));
    }
    inputOf(0, 'instructions', ' Linha 1\nLinha 2 '); inputOf(0, 'expectedResult', ' Esperado 1\nEsperado 2 '); component().saveTemplate();
    expect(updateTemplate.mock.calls[0][1].items[0]).toEqual(expect.objectContaining({ instructions: 'Linha 1\nLinha 2', expectedResult: 'Esperado 1\nEsperado 2' }));
  });

  // Vermelho: Adicionar e Remover ficam habilitados e não respeitam publicação pendente.
  it('does not change selection or items while publication is pending and recovers on error', async () => {
    await setup(); open(0); const pending = new Subject<ProtocolTemplateResponse>(); updateTemplate.mockReturnValueOnce(pending);
    component().saveTemplate(); render();
    expect(button('Adicionar item').disabled).toBe(true); expect(button('Recolher todos').disabled).toBe(true);
    expect(summaries().every((b) => b.disabled)).toBe(true);
    expect(Array.from<HTMLButtonElement>(panel().querySelectorAll('[aria-label^="Remover item"]')).every((b) => b.disabled)).toBe(true);
    component().toggleItem(items().at(2)); component().toggleAllItems(); component().addItem(); component().removeItem(0); render();
    expect(items().length).toBe(3); expect(expanded()).toEqual(['true', 'false', 'false']); expect(titleOf(0).value).toBe('Tensão');
    pending.error({ error: { message: 'Versão recusada.' } }); render();
    expect(titleOf(0).value).toBe('Tensão'); expect(summaries()[0].getAttribute('aria-expanded')).toBe('true'); expect(button('Adicionar item').disabled).toBe(false);
    open(2); expect(titleOf(2).value).toBe('Observação'); component().saveTemplate(); render();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    component().openEditModal(TEMPLATE); await stable(); expect(expanded()).toEqual(['false', 'false', 'false']);
    component().closeModal(); component().openCreateModal(); await stable();
    expect(summaries()).toHaveLength(1); expect(expanded()).toEqual(['true']); expect(titleOf(0).value).toBe('');
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
