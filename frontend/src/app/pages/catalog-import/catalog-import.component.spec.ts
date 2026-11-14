import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { CatalogService } from '../../core/services/catalog.service';
import { CatalogImportComponent } from './catalog-import.component';

describe('CatalogImportComponent', () => {
  const preview = { fileName: 'dados.csv', delimiter: ';', totalRows: 3, validRows: 1, invalidRows: 1, duplicateRows: 1, blankRows: 0, rows: [
    { lineNumber: 2, status: 'VALID', values: { legalName: 'Cliente' }, reasons: [], warnings: [{ field: 'phone', code: 'NOTICE', message: '<b>Aviso</b>' }] },
    { lineNumber: 3, status: 'INVALID', values: {}, reasons: [{ field: 'legalName', code: 'REQUIRED', message: 'Obrigatório' }], warnings: [] },
    { lineNumber: 4, status: 'DUPLICATE', values: {}, reasons: [], warnings: [] }
  ] };
  function setup() {
    const confirmation = new Subject<any>();
    const service = { previewImport: vi.fn(() => of(preview)), confirmImport: vi.fn(() => confirmation), downloadImportTemplate: vi.fn(() => of(new Blob())) };
    const router = { navigate: vi.fn(() => Promise.resolve(true)) };
    TestBed.configureTestingModule({ imports: [CatalogImportComponent], providers: [
      { provide: CatalogService, useValue: service }, { provide: ActivatedRoute, useValue: { snapshot: { data: { catalogKind: 'clients' } } } }, { provide: Router, useValue: router }
    ] });
    const fixture = TestBed.createComponent(CatalogImportComponent);
    fixture.detectChanges();
    return { fixture, page: fixture.componentInstance as any, service, router, confirmation };
  }
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

});
