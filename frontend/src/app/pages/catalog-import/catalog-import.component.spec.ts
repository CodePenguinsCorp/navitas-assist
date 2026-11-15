import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { CatalogService } from '../../core/services/catalog.service';
import { CatalogImportComponent } from './catalog-import.component';

describe('CatalogImportComponent', () => {
  const preview = { fileName: 'dados.csv', delimiter: ';', totalRows: 3, validRows: 1, invalidRows: 1, duplicateRows: 1, blankRows: 0, rows: [
    { lineNumber: 2, status: 'VALID', values: { legalName: 'Cliente', sku: 'P01', name: 'Produto' }, reasons: [], warnings: [{ field: 'phone', code: 'NOTICE', message: '<b>Aviso</b>' }] },
    { lineNumber: 3, status: 'INVALID', values: {}, reasons: [{ field: 'legalName', code: 'REQUIRED', message: 'Obrigatório' }], warnings: [] },
    { lineNumber: 4, status: 'DUPLICATE', values: {}, reasons: [], warnings: [] }
  ] };
  function setup(kind = 'clients') {
    const confirmation = new Subject<any>();
    const service = { previewImport: vi.fn(() => of(preview)), confirmImport: vi.fn(() => confirmation), downloadImportTemplate: vi.fn(() => of(new Blob())) };
    const router = { navigate: vi.fn(() => Promise.resolve(true)) };
    TestBed.configureTestingModule({ imports: [CatalogImportComponent], providers: [
      { provide: CatalogService, useValue: service }, { provide: ActivatedRoute, useValue: { snapshot: { data: { catalogKind: kind } } } }, { provide: Router, useValue: router }
    ] });
    const fixture = TestBed.createComponent(CatalogImportComponent);
    fixture.detectChanges();
    return { fixture, page: fixture.componentInstance as any, service, router, confirmation };
  }
  it('separa modelo, arquivo e prévia e orienta salvar em UTF-8', () => {
    const { page, service, fixture } = setup();
    expect(fixture.nativeElement.querySelector('section[aria-label="Modelo"] button').textContent).toContain('Baixar modelo');
    service.previewImport.mockReturnValue(throwError(() => ({ status: 400, error: { message: 'Arquivo deve estar em UTF-8' } })) as any);
    page.selectFile({ target: { files: [new File(['a'], 'a.csv')] } });
    page.generatePreview(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('section[aria-label="Arquivo"] [role="alert"]').textContent).toContain('Salve o arquivo como CSV UTF-8');
  });

  it('associa a dica de formato ao arquivo e mostra o nome selecionado', () => {
    const { fixture, page } = setup();
    const input = fixture.nativeElement.querySelector('input[type="file"]');
    expect(input.getAttribute('aria-describedby')).toBe('import-file-hint');
    expect(fixture.nativeElement.querySelector('#import-file-hint').textContent).toContain('2.000 registros');
    expect(fixture.nativeElement.textContent).toContain('Selecione um arquivo CSV');
    page.selectFile({ target: { files: [new File(['dados'], 'clientes.csv')] } });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('label[for="import-file"].import-dropzone').textContent).toContain('clientes.csv');
  });

  it('confirma o mesmo File da prévia uma única vez e volta à lista com resumo', () => {
    const { page, service, router, confirmation } = setup();
    const file = new File(['dados'], 'dados.csv');
    page.selectFile({ target: { files: [file] } });
    page.generatePreview();
    page.confirm();
    page.confirm();
    expect(service.previewImport).toHaveBeenCalledWith('clients', file);
    expect(service.confirmImport).toHaveBeenCalledExactlyOnceWith('clients', file);
    confirmation.next({ importedRows: 1, ignoredInvalidRows: 1, ignoredDuplicateRows: 1 });
    confirmation.complete();
    expect(router.navigate).toHaveBeenCalledWith(['/clientes'], { state: { importSummary: expect.stringContaining('1') } });
  });
  it('descarta prévia ao trocar arquivo e impede importar sem válidas', () => {
    const { page, service } = setup();
    page.selectFile({ target: { files: [new File(['a'], 'a.csv')] } });
    page.generatePreview();
    page.selectFile({ target: { files: [new File(['b'], 'b.csv')] } });
    expect(page.preview()).toBeNull();
    page.confirm();
    expect(service.confirmImport).not.toHaveBeenCalled();
  });
  it('filtra, pagina e renderiza avisos como texto', () => {
    const { page, fixture } = setup();
    page.selectFile({ target: { files: [new File(['a'], 'a.csv')] } });
    page.generatePreview();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('<b>Aviso</b>');
    expect(fixture.nativeElement.querySelector('section[aria-label="Prévia"] table')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Telefone: <b>Aviso</b>');
    expect(fixture.nativeElement.querySelector('tbody b')).toBeNull();
    page.changeFilter('INVALID');
    expect(page.visibleRows().map((row: any) => row.lineNumber)).toEqual([3]);
    page.changeFilter('all');
    page.changeSize(1);
    page.page.set(1);
    expect(page.visibleRows()[0].lineNumber).toBe(3);
  });
  it('mostra erro de tamanho inline preservando arquivo para nova tentativa', () => {
    const { page, service, fixture } = setup();
    service.previewImport.mockReturnValue(throwError(() => ({ status: 413 })) as any);
    page.selectFile({ target: { files: [new File(['a'], 'a.csv')] } });
    page.generatePreview();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('grande');
    expect(page.busy()).toBe(false);
  });
  it('bloqueia importar quando a previa contem apenas linhas invalidas', () => {
    const { page, service, fixture } = setup();
    service.previewImport.mockReturnValue(of({ ...preview, validRows: 0 }));
    page.selectFile({ target: { files: [new File(['a'], 'a.csv')] } });
    page.generatePreview();
    fixture.detectChanges();
    const button = [...fixture.nativeElement.querySelectorAll('button')].find((item: any) => item.textContent.includes('Importar 0')) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    page.confirm();
    expect(service.confirmImport).not.toHaveBeenCalled();
  });
  it.each([400, 415])('mostra erro %s inline e permite corrigir o arquivo', status => {
    const { page, service, fixture } = setup();
    service.previewImport.mockReturnValue(throwError(() => ({ status, error: { message: 'CSV incorreto' } })) as any);
    page.selectFile({ target: { files: [new File(['a'], 'a.csv')] } });
    page.generatePreview();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent.trim()).not.toBe('');
    expect(page.busy()).toBe(false);
    expect(page.file()).not.toBeNull();
  });

  it.each(['clients', 'products'])('filtra pelas métricas acessíveis e apresenta chips em %s', kind => {
    const { page, fixture } = setup(kind);
    page.selectFile({ target: { files: [new File(['a'], 'a.csv')] } });
    page.generatePreview(); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const metrics = root.querySelectorAll<HTMLButtonElement>('.page-summary button');
    expect(metrics.length).toBe(3);
    expect(metrics[0].textContent).toContain('1 válida');
    expect(root.querySelector('caption')?.textContent).toContain('Prévia');
    expect(root.querySelectorAll('tbody .mini-chip').length).toBe(3);
    expect(root.querySelector('tbody tr:last-child td:last-child')?.textContent?.trim()).toBe('-');
    expect(root.querySelector('[aria-live="polite"][aria-atomic="true"]')?.textContent).toContain('3 linhas');
    expect(root.textContent).toContain('0 linhas em branco ignoradas');
    expect(root.textContent).toContain('Importar 1 linha válida');
    metrics[0].click(); fixture.detectChanges();
    expect(root.querySelector('tbody .table-title')?.textContent).toBe(kind === 'clients' ? 'Cliente' : 'P01 - Produto');
    expect(root.querySelectorAll('tbody tr').length).toBe(1);
    metrics[2].click(); fixture.detectChanges();
    expect(root.querySelector('tbody .mini-chip')?.textContent).toBe('duplicada');
    metrics[1].click(); fixture.detectChanges();
    expect(metrics[1].getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelectorAll('tbody tr').length).toBe(1);
    expect(root.querySelector('tbody')?.textContent).toContain('Obrigatório');
    expect(root.querySelector('.import-clear')?.textContent).toBe('Limpar filtro');
    metrics[1].click(); fixture.detectChanges();
    expect(metrics[1].getAttribute('aria-pressed')).toBe('false');
    expect(root.querySelectorAll('tbody tr').length).toBe(3);
    expect(root.querySelector('.import-clear')).toBeNull();
    expect([...root.querySelectorAll('button')].some(b => b.textContent?.trim() === 'Todas')).toBe(false);
    metrics[0].click(); fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.import-clear')!.click(); fixture.detectChanges();
    expect(metrics[0].getAttribute('aria-pressed')).toBe('false');
    expect(root.querySelectorAll('tbody tr').length).toBe(3);
    page.preview.set({ ...page.preview(), rows: [], validRows: 12, invalidRows: 0, duplicateRows: 0, totalRows: 1, blankRows: 1 });
    metrics[2].click(); fixture.detectChanges();
    expect(root.querySelector('tbody')?.textContent).toContain('Nenhuma linha nesta situação');
    expect(metrics[0].textContent).toContain('12 válidas');
    expect(metrics[1].textContent).toContain('0 inválidas');
    expect(metrics[2].textContent).toContain('0 duplicadas');
    expect(root.querySelector('.import-file-info')?.textContent).toContain('1 linha, 1 linha em branco ignorada');
    expect(root.textContent).toContain('Importar 12 linhas válidas');
    expect(root.querySelector('section[aria-label="Prévia"] footer')).not.toBeNull();
    expect(root.querySelector('a.page-heading__back')?.getAttribute('aria-label')).toBe(kind === 'clients' ? 'Voltar para Clientes' : 'Voltar para Produtos');
    expect([...root.querySelectorAll('button')].some(b => b.textContent?.trim() === 'Cancelar')).toBe(false);
  });

  it.each([['clients', 0], ['clients', 1], ['clients', 12], ['products', 0], ['products', 1], ['products', 12]] as const)('flexiona o resultado de %s com %s registros', (kind, count) => {
    const { page, router, confirmation } = setup(kind);
    page.selectFile({ target: { files: [new File(['a'], 'a.csv')] } });
    page.generatePreview(); page.confirm();
    confirmation.next({ importedRows: count, ignoredInvalidRows: count, ignoredDuplicateRows: count });
    expect(router.navigate).toHaveBeenCalledWith([kind === 'clients' ? '/clientes' : '/produtos'], expect.anything());
    const summary = (router.navigate.mock.calls as any)[0][1].state.importSummary;
    expect(summary).toBe(count === 1
      ? '1 linha importada. 2 ignoradas.'
      : count === 0 ? '0 linhas importadas.' : `${count} linhas importadas. ${count * 2} ignoradas.`);
  });

});
