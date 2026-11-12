import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { FormArray, FormGroup } from '@angular/forms';
import { Observable, Subject, of, throwError } from 'rxjs';
import { ProtocolTemplateItemResponse, ProtocolTemplateRequest, ProtocolTemplateResponse } from '../../core/models';
import { CatalogService } from '../../core/services/catalog.service';
import { ProtocolService } from '../../core/services/protocol.service';
import { LoadingService } from '../../core/services/loading.service';
import { expectCancelBeforePrimary } from '../../testing/dialog-actions';
import { provideRouter } from '@angular/router';
import { App } from '../../app';
import { mountUnderRoot, simulateNativeModality } from '../../testing/native-dialog';
import { ProtocolsComponent } from './protocols.component';

interface ProtocolsHarness {
  openCreateModal(): void;
  openEditModal(template: ProtocolTemplateResponse): void;
  closeModal(): void;
  updateSearch(value: string): void;
  retryLoad(): void;
  form: FormGroup & { controls: FormGroup['controls'] & { items: FormArray<FormGroup> } };
}

function item(overrides: Partial<ProtocolTemplateItemResponse> = {}): ProtocolTemplateItemResponse {
  return {
    id: 1, sortOrder: 1, stepName: 'Diagnóstico', title: 'Conferir alimentação', instructions: null,
    type: 'CHECK', required: true, unit: null, decimalPlaces: null, minValue: null, maxValue: null,
    expectedResult: null, evidenceRequired: false,
    ...overrides
  };
}

function template(overrides: Partial<ProtocolTemplateResponse> = {}): ProtocolTemplateResponse {
  return {
    id: 1, name: 'Diagnóstico Alfa', productId: 10, productName: 'Produto Alfa', category: null,
    active: true, currentVersion: 1, blockedStatuses: [], items: [item()],
    updatedAt: '2026-10-20T12:00:00Z',
    ...overrides
  };
}

function catalog(): ProtocolTemplateResponse[] {
  return [
    template(),
    template({ id: 2, name: 'Teste de fonte', productId: null, productName: null, category: 'Fontes', active: false, currentVersion: 3 })
  ];
}

const loadError = () => throwError(() => new HttpErrorResponse({ status: 500 }));

function expectPending(root: HTMLElement): void {
  const busy = root.querySelector('[aria-busy="true"]');
  expect(busy?.textContent?.trim()).toBe('');
  expect(busy?.children.length).toBe(0);
  expect(root.textContent).not.toContain('Carregando');
}

describe('ProtocolsComponent', () => {
  let fixture: ComponentFixture<ProtocolsComponent>;
  let component: ProtocolsHarness;
  let listTemplates: ReturnType<typeof vi.fn>;
  let createTemplate: ReturnType<typeof vi.fn>;
  let updateTemplate: ReturnType<typeof vi.fn>;

  async function setup(list: () => Observable<ProtocolTemplateResponse[]> = () => of(catalog())): Promise<void> {
    listTemplates = vi.fn(list);
    createTemplate = vi.fn((request: ProtocolTemplateRequest) => of(template({ id: 9, name: request.name })));
    updateTemplate = vi.fn((id: number, request: ProtocolTemplateRequest) => of(template({ id, name: request.name, currentVersion: 2 })));
    await TestBed.configureTestingModule({
      imports: [ProtocolsComponent],
      providers: [
        { provide: ProtocolService, useValue: { listTemplates, createTemplate, updateTemplate } },
        { provide: CatalogService, useValue: { listProductOptions: vi.fn(() => of([])) } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ProtocolsComponent);
    component = fixture.componentInstance as unknown as ProtocolsHarness;
    fixture.detectChanges();
  }

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(): string {
    return element().textContent ?? '';
  }

  function count(): string | null {
    return element().querySelector('.result-count')?.textContent?.trim() ?? null;
  }

  function buttonByText(label: string): HTMLButtonElement | undefined {
    return Array.from(element().querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.trim() === label);
  }

  function rows(): HTMLTableRowElement[] {
    return Array.from(element().querySelectorAll<HTMLTableRowElement>('tbody tr'));
  }

  it.each(['initial', 'data', 'empty'])('renders an empty busy catalog during %s loading', async (previous) => {
    const pending = new Subject<ProtocolTemplateResponse[]>();
    await setup(previous === 'initial' ? () => pending : previous === 'empty' ? () => of([]) : undefined);
    if (previous !== 'initial') {
      listTemplates.mockImplementation(() => pending); component.retryLoad(); fixture.detectChanges();
    }
    expectPending(element());
    expect(element().querySelector('tbody, .table-card .empty-state')).toBeNull();
    expect(text()).not.toContain('Nenhum protocolo cadastrado');
    pending.next([]); pending.complete(); fixture.detectChanges();
    expect(text()).toContain('Nenhum protocolo cadastrado');
  });

  describe('catalog', () => {
    it('shows Cancelar before the primary action in the form dialog', async () => {
      await setup(() => of([]));
      component.openCreateModal();
      fixture.detectChanges();

      expectCancelBeforePrimary(element());
    });

    it('shows the count at the foot of the list and "X de Y" while searching', async () => {
      await setup();

      expect(count()).toBe('2 protocolos');
      expect(element().querySelector('.search-field')?.textContent).not.toContain('registro(s)');

      component.updateSearch('Alfa');
      fixture.detectChanges();

      expect(count()).toBe('1 de 2 protocolos');
      expect(rows()).toHaveLength(1);
      expect(listTemplates).toHaveBeenCalledTimes(1);
    });

    it('shows state in its own column', async () => {
      await setup();

      const headers = Array.from(element().querySelectorAll('thead th')).map((th) => th.textContent?.trim());
      expect(headers).toContain('Estado');
      expect(headers).toContain('Etapas bloqueadas');
      expect(headers).toContain('Ações');
      expect(headers).not.toContain('Ação');

      const states = Array.from(element().querySelectorAll('tbody .state-dot')).map((dot) => dot.textContent?.trim());
      expect(states).toEqual(['Ativo', 'Inativo']);
      expect(element().querySelector('tbody .state-dot.is-on')?.textContent?.trim()).toBe('Ativo');

      const nameCell = rows()[0].querySelector('td');
      expect(nameCell?.textContent).toContain('Diagnóstico Alfa');
      expect(nameCell?.textContent).not.toContain('Ativo');
    });

    it('names the Nova versão action with the protocol', async () => {
      await setup();

      const action = rows()[0].querySelector<HTMLButtonElement>('.table-actions-col button');
      expect(action?.textContent?.trim()).toBe('Nova versão');
      expect(action?.getAttribute('aria-label')).toBe('Nova versão de Diagnóstico Alfa');
    });

    it('shows the empty catalog with a create action', async () => {
      await setup(() => of([]));

      expect(text()).toContain('Nenhum protocolo cadastrado');
      expect(text()).not.toContain('Nenhum protocolo encontrado');
      expect(count()).toBe('0 protocolos');

      buttonByText('Cadastrar protocolo')!.click();
      fixture.detectChanges();

      expect(element().querySelector('.modal-panel h3')?.textContent?.trim()).toBe('Novo protocolo');
    });

    it('shows search without results with a clear action', async () => {
      await setup();

      component.updateSearch('inexistente');
      fixture.detectChanges();

      expect(text()).toContain('Nenhum protocolo encontrado');
      expect(text()).toContain('Ajuste a busca.');
      expect(text()).not.toContain('Nenhum protocolo cadastrado');
      expect(count()).toBe('0 de 2 protocolos');

      buttonByText('Limpar busca')!.click();
      fixture.detectChanges();

      expect(rows()).toHaveLength(2);
      expect(count()).toBe('2 protocolos');
      expect((element().querySelector('.search-field input') as HTMLInputElement).value).toBe('');
    });

    it('shows the failure state on load error', async () => {
      await setup(loadError);

      const alert = element().querySelector('[role="alert"]');
      expect(alert?.textContent).toContain('Não foi possível carregar os protocolos.');
      expect(buttonByText('Tentar novamente')).toBeDefined();
      expect(text()).not.toContain('Nenhum protocolo cadastrado');
      expect(text()).not.toContain('Carregando protocolos...');
      expect(count()).toBeNull();
      expect(element().querySelector('.alert-banner--error')).toBeNull();
    });

    it('keeps the failure after opening and closing the form', async () => {
      await setup(loadError);

      component.openCreateModal();
      fixture.detectChanges();
      component.closeModal();
      fixture.detectChanges();

      expect(element().querySelector('[role="alert"]')?.textContent).toContain('Não foi possível carregar os protocolos.');
      expect(text()).not.toContain('Nenhum protocolo cadastrado');
    });

    it('shows the failure when a reload fails after a success', async () => {
      await setup();
      expect(rows()).toHaveLength(2);

      listTemplates.mockImplementation(loadError);
      component.retryLoad();
      fixture.detectChanges();

      expect(element().querySelector('[role="alert"]')?.textContent).toContain('Não foi possível carregar os protocolos.');
      expect(element().querySelector('tbody')).toBeNull();
      expect(count()).toBeNull();
    });

    it('shows the failure when a reload fails after an empty success', async () => {
      await setup(() => of([]));
      expect(text()).toContain('Nenhum protocolo cadastrado');
      expect(count()).toBe('0 protocolos');

      listTemplates.mockImplementation(loadError);
      component.retryLoad();
      fixture.detectChanges();

      expect(element().querySelector('[role="alert"]')?.textContent).toContain('Não foi possível carregar os protocolos.');
      expect(buttonByText('Tentar novamente')).toBeDefined();
      expect(text()).not.toContain('Nenhum protocolo cadastrado');
      expect(buttonByText('Cadastrar protocolo')).toBeUndefined();
      expect(element().querySelector('tbody')).toBeNull();
      expect(count()).toBeNull();
    });

    it('shows a disabled loading retry without the old table or count while the retry is pending, then recovers', async () => {
      await setup();
      expect(count()).toBe('2 protocolos');
      listTemplates.mockImplementation(loadError);
      component.retryLoad();
      fixture.detectChanges();
      expect(element().querySelector('[role="alert"]')).not.toBeNull();

      const pending = new Subject<ProtocolTemplateResponse[]>();
      listTemplates.mockImplementation(() => pending);
      buttonByText('Tentar novamente')!.click();
      fixture.detectChanges();

      const retry = element().querySelector('[role="alert"]')!.querySelector<HTMLButtonElement>('button')!;
      expect(retry.disabled).toBe(true);
      expect(retry.textContent?.trim()).toBe('Tentar novamente');
    expect(element().querySelector('[aria-busy="true"]')).not.toBeNull();
      expect(buttonByText('Tentar novamente')?.disabled).toBe(true);
      expect(element().querySelector('tbody')).toBeNull();
      expect(count()).toBeNull();

      pending.next([template({ id: 3, name: 'Teste de bancada' })]);
      pending.complete();
      fixture.detectChanges();

      expect(element().querySelector('[role="alert"]')).toBeNull();
      expect(rows()).toHaveLength(1);
      expect(rows()[0].textContent).toContain('Teste de bancada');
      expect(count()).toBe('1 protocolo');
    });

    it('recovers with Tentar novamente', async () => {
      await setup(loadError);

      listTemplates.mockImplementation(() => of(catalog()));
      buttonByText('Tentar novamente')!.click();
      fixture.detectChanges();

      expect(listTemplates).toHaveBeenCalledTimes(2);
      expect(element().querySelector('[role="alert"]')).toBeNull();
      expect(rows()).toHaveLength(2);
      expect(count()).toBe('2 protocolos');
    });

    it('announces the success banner as status', async () => {
      await setup();
      (fixture.componentInstance as unknown as { successMessage: { set(value: string): void } }).successMessage.set('Protocolo X cadastrado.');
      fixture.detectChanges();

      expect(element().querySelector('.alert-banner--success')?.getAttribute('role')).toBe('status');
    });
  });

  describe('form', () => {
    function dialog(): HTMLElement | null {
      return element().querySelector<HTMLElement>('[role="dialog"]');
    }

    function submit(): void {
      dialog()!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
      fixture.detectChanges();
    }

    function fieldOf(selector: string): HTMLElement {
      return dialog()!.querySelector(selector)!.closest('.field-group') as HTMLElement;
    }

    function errorOf(selector: string): string | null {
      return fieldOf(selector).querySelector('.field-error')?.textContent?.trim() ?? null;
    }

    /** Programmatic form changes do not schedule a check; user events do. */
    function refresh(): void {
      fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
      fixture.detectChanges();
    }

    function fillValid(): void {
      component.form.patchValue({ name: 'Novo checklist', category: 'Fontes' });
      component.form.controls.items.at(0).patchValue({ stepName: 'Diagnóstico', title: 'Conferir tensão' });
      refresh();
    }

    it('groups the form into Configuração geral, Etapas bloqueadas and Itens', async () => {
      await setup();
      component.openCreateModal();
      fixture.detectChanges();

      const panel = dialog()!;
      expect(panel.getAttribute('aria-modal')).toBe('true');
      const titleId = panel.getAttribute('aria-labelledby');
      expect(titleId).toBeTruthy();
      expect(panel.querySelector('#' + titleId)?.textContent?.trim()).toBe('Novo protocolo');

      const sections = Array.from(panel.querySelectorAll<HTMLFieldSetElement>('fieldset.form-section'));
      expect(sections.map((section) => section.querySelector('legend')?.textContent?.trim())).toEqual(['Configuração geral', 'Etapas bloqueadas', 'Itens']);

      const [general, blocked, items] = sections;
      for (const name of ['name', 'productId', 'category', 'active']) {
        expect(general.querySelector('[formcontrolname="' + name + '"]')).not.toBeNull();
      }
      expect(blocked.textContent).toContain('Bloquear mudança do RMA para estas etapas enquanto houver obrigatórios pendentes');
      expect(blocked.querySelectorAll('input[type="checkbox"]').length).toBeGreaterThan(0);
      expect(general.querySelector('[formcontrolname="stepName"]')).toBeNull();
      expect(items.querySelector('[formcontrolname="stepName"]')).not.toBeNull();
      expect(items.querySelector('[formcontrolname="title"]')).not.toBeNull();

      buttonByText('Adicionar item')!.click();
      fixture.detectChanges();

      const summaries = Array.from(items.querySelectorAll('.protocol-item-summary'));
      expect(summaries.map((summary) => summary.querySelector('.item-row__badge')?.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['Item 1', 'Item 2']);
      expect(items.querySelectorAll('.protocol-item-card')).toHaveLength(1);
      const removes = Array.from(items.querySelectorAll('.protocol-item-summary-row')).map((row) => row.querySelector<HTMLButtonElement>('button.icon-button'));
      expect(removes.map((button) => button?.getAttribute('aria-label'))).toEqual(['Remover item 1', 'Remover item 2']);
    });

    it('shows the category only without a product', async () => {
      await setup();
      component.openCreateModal();
      fixture.detectChanges();
      expect(dialog()!.querySelector('[formcontrolname="category"]')).not.toBeNull();

      component.closeModal();
      component.openEditModal(catalog()[0]);
      fixture.detectChanges();
      expect(dialog()!.querySelector('[formcontrolname="category"]')).toBeNull();
    });

    it('shows field errors after an invalid submit', async () => {
      await setup();
      component.openCreateModal();
      fixture.detectChanges();

      expect(dialog()!.querySelector('.field-error')).toBeNull();

      submit();

      expect(errorOf('[formcontrolname="name"]')).toBe('Informe o nome do protocolo.');
      expect(errorOf('[formcontrolname="category"]')).toBe('Informe a categoria ou selecione um produto.');
      expect(errorOf('[formcontrolname="stepName"]')).toBe('Informe a etapa.');
      expect(errorOf('[formcontrolname="title"]')).toBe('Informe o item.');
      expect(dialog()!.querySelector('[role="alert"]')?.textContent).toContain('Revise os campos e informe o produto ou a categoria do protocolo.');
      expect(createTemplate).not.toHaveBeenCalled();

      component.form.patchValue({ name: 'x'.repeat(121), category: 'Fontes' });
      refresh();
      expect(errorOf('[formcontrolname="name"]')).toBe('Use até 120 caracteres.');
      expect(errorOf('[formcontrolname="category"]')).toBeNull();
    });

    it('starts a reopened form without field errors', async () => {
      await setup();
      component.openCreateModal();
      fixture.detectChanges();
      submit();
      component.closeModal();
      component.openCreateModal();
      fixture.detectChanges();

      expect(dialog()!.querySelector('.field-error')).toBeNull();
    });

    it('shows decimal and decimal places errors for measurement items', async () => {
      await setup();
      component.openCreateModal();
      fixture.detectChanges();
      component.form.controls.items.at(0).controls['type'].setValue('MEASUREMENT');
      refresh();

      const places = dialog()!.querySelector<HTMLInputElement>('[formcontrolname="decimalPlaces"]')!;
      places.value = '7';
      places.dispatchEvent(new Event('input'));
      const min = dialog()!.querySelector<HTMLInputElement>('[formcontrolname="minValue"]')!;
      min.value = '1,1234567';
      min.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      expect(errorOf('[formcontrolname="decimalPlaces"]')).toBe('Use de 0 a 6 casas decimais.');
      expect(errorOf('[formcontrolname="minValue"]')).toBe('Use um número com até 13 dígitos inteiros e até 6 casas decimais, separadas por vírgula ou ponto.');
      expect(errorOf('[formcontrolname="maxValue"]')).toBeNull();
    });

    it('stays open while publishing a new protocol and closes on success', async () => {
      await setup();
      const pending = new Subject<ProtocolTemplateResponse>();
      createTemplate.mockImplementation(() => pending);
      component.openCreateModal();
      fixture.detectChanges();
      fillValid();
      submit();

      expect(createTemplate).toHaveBeenCalledTimes(1);
      expect(dialog()!.querySelector<HTMLButtonElement>('.modal-close')!.disabled).toBe(true);
      component.closeModal();
      fixture.detectChanges();
      expect(dialog()).not.toBeNull();
      element().querySelector<HTMLElement>('.modal-overlay')!.click();
      fixture.detectChanges();
      expect(dialog()).not.toBeNull();

      pending.next(template({ id: 9, name: 'Novo checklist' }));
      pending.complete();
      fixture.detectChanges();

      expect(dialog()).toBeNull();
      expect(element().querySelector('[role="status"]')?.textContent).toContain('Protocolo Novo checklist cadastrado.');
      expect(listTemplates).toHaveBeenCalledTimes(2);
    });

    it('stays open while publishing a new version and closes on success', async () => {
      await setup();
      const pending = new Subject<ProtocolTemplateResponse>();
      updateTemplate.mockImplementation(() => pending);
      component.openEditModal(catalog()[0]);
      fixture.detectChanges();
      submit();

      expect(dialog()!.querySelector<HTMLButtonElement>('.modal-close')!.disabled).toBe(true);
      component.closeModal();
      element().querySelector<HTMLElement>('.modal-overlay')!.click();
      fixture.detectChanges();
      expect(dialog()).not.toBeNull();

      pending.next(template({ currentVersion: 2 }));
      pending.complete();
      fixture.detectChanges();

      expect(dialog()).toBeNull();
      expect(element().querySelector('[role="status"]')?.textContent).toContain('Protocolo Diagnóstico Alfa publicado na versão 2.');
      expect(listTemplates).toHaveBeenCalledTimes(2);
    });

    it('keeps values and reopens closing after a failure', async () => {
      await setup();
      createTemplate.mockImplementation(() => throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'Já existe um protocolo com este nome.' } })));
      component.openCreateModal();
      fixture.detectChanges();
      fillValid();
      submit();

      expect(dialog()).not.toBeNull();
      expect(dialog()!.querySelector<HTMLInputElement>('[formcontrolname="name"]')!.value).toBe('Novo checklist');
      expect(dialog()!.querySelector('[role="alert"]')?.textContent).toContain('Já existe um protocolo com este nome.');

      const close = dialog()!.querySelector<HTMLButtonElement>('.modal-close')!;
      expect(close.disabled).toBe(false);
      close.click();
      fixture.detectChanges();
      expect(dialog()).toBeNull();
    });

    it('opens a new version with the original rule and publishes through updateTemplate', async () => {
      await setup();
      component.openEditModal(catalog()[0]);
      fixture.detectChanges();

      const panel = element().querySelector<HTMLElement>('.modal-panel')!;
      expect(panel.querySelector('h3')?.textContent?.trim()).toBe('Nova versão do protocolo');
      expect(panel.textContent).toContain('Execuções já iniciadas continuam na versão em que começaram.');
      expect(panel.querySelector('button[type="submit"]')?.textContent?.trim()).toBe('Publicar nova versão');

      panel.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
      fixture.detectChanges();

      expect(createTemplate).not.toHaveBeenCalled();
      expect(updateTemplate).toHaveBeenCalledWith(1, {
        name: 'Diagnóstico Alfa',
        productId: 10,
        category: null,
        active: true,
        blockedStatuses: [],
        items: [{
          stepName: 'Diagnóstico', title: 'Conferir alimentação', instructions: null, type: 'CHECK', required: true,
          unit: null, decimalPlaces: null, minValue: null, maxValue: null, expectedResult: null, evidenceRequired: false
        }]
      });
    });
  });
});

describe('ProtocolsComponent dialog focus', () => {
  let fixture: ComponentFixture<App>;
  let restoreModality: () => void;
  let element: HTMLElement;
  let loading: LoadingService;
  let templates: ProtocolTemplateResponse[];
  let publish: Subject<ProtocolTemplateResponse>;

  beforeEach(async () => {
    // Under the real root, whose blocker takes focus on showModal() as in a browser.
    restoreModality = simulateNativeModality();
    templates = catalog();
    await TestBed.configureTestingModule({
      imports: [ProtocolsComponent],
      providers: [provideRouter([{ path: '', component: ProtocolsComponent }]), 
        { provide: ProtocolService, useValue: {
          listTemplates: () => of(templates),
          createTemplate: () => (publish = new Subject<ProtocolTemplateResponse>()),
          updateTemplate: () => (publish = new Subject<ProtocolTemplateResponse>())
        } },
        { provide: CatalogService, useValue: { listProductOptions: () => of([]) } }
      ]
    }).compileComponents();
    ({ fixture, element } = await mountUnderRoot(ProtocolsComponent));
    vi.useFakeTimers();
    loading = TestBed.inject(LoadingService);
    render();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    restoreModality();
  });

  function render(): void {
    fixture.detectChanges();
    TestBed.tick();
  }

  function find(selector: string): HTMLElement {
    const found = element.querySelector<HTMLElement>(selector);
    expect(found, selector + ' must exist').not.toBeNull();
    return found!;
  }

  function activate(selector: string): HTMLButtonElement {
    const trigger = find(selector) as HTMLButtonElement;
    trigger.focus();
    trigger.click();
    render();
    return trigger;
  }

  function escape(): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    (document.activeElement ?? document.body).dispatchEvent(event);
    render();
    return event;
  }

  function publishVersion(): void {
    find('[role="dialog"] button[type="submit"]').click();
    render();
  }

  function showOverlay(): void {
    loading.start();
    vi.advanceTimersByTime(200);
    render();
    expect(blocker().open, 'the root blocker is shown').toBe(true);
    const dialog = element.querySelector('[role="dialog"], [role="alertdialog"]');
    expect(dialog?.contains(document.activeElement) ?? false, 'the blocker took focus away from the dialog').toBe(false);
  }

  function blocker(): HTMLDialogElement {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLDialogElement>('dialog.global-loading-dialog')!;
  }

  function hideOverlay(): void {
    loading.finish();
    vi.advanceTimersByTime(400);
    render();
  }

  const newVersion = 'button[aria-label="Nova versão de Diagnóstico Alfa"]';

  it('focuses the protocol name from Novo protocolo and returns to it on Escape', () => {
    const trigger = activate('.page-heading button');
    expect(document.activeElement).toBe(find('[formControlName="name"]'));
    expect(escape().defaultPrevented).toBe(true);
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('ignores Escape while a new version is being published', () => {
    activate(newVersion);
    publishVersion();
    escape();
    expect(element.querySelector('[role="dialog"]')).not.toBeNull();
    publish.next(template({ currentVersion: 2 }));
    publish.complete();
    render();
    expect(element.querySelector('[role="dialog"]')).toBeNull();
  });

  it('returns to Nova versão only after the global overlay hides when publishing succeeds under it', () => {
    const trigger = activate(newVersion);
    publishVersion();
    showOverlay();
    const focus = vi.spyOn(trigger, 'focus');
    publish.next(template({ currentVersion: 2 }));
    publish.complete();
    render();
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    expect(focus).not.toHaveBeenCalled();
    hideOverlay();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
  });

  it('falls back to Novo protocolo when the row disappears after publishing, once the overlay hides', () => {
    activate(newVersion);
    publishVersion();
    showOverlay();
    templates = [catalog()[1]];
    publish.next(template({ currentVersion: 2 }));
    publish.complete();
    render();
    expect(element.querySelector(newVersion)).toBeNull();
    const fallback = find('.page-heading button');
    expect(document.activeElement).not.toBe(fallback);
    hideOverlay();
    expect(document.activeElement).toBe(fallback);
  });
});
