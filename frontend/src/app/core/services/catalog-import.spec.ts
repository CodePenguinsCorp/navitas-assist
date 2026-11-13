import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CatalogService } from './catalog.service';

describe('CSV stateless', () => {
  it('reenvia o mesmo arquivo multipart na prévia e confirmação de ambos os cadastros', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const service = TestBed.inject(CatalogService);
    const http = TestBed.inject(HttpTestingController);
    const file = new File(['sku,name\nA,Produto'], 'dados.csv', { type: 'text/csv' });
    for (const kind of ['clients', 'products'] as const) {
      service.previewImport(kind, file).subscribe();
      const preview = http.expectOne(`/api/${kind}/imports/preview`);
      expect(preview.request.method).toBe('POST');
      expect(preview.request.body.get('file')).toBe(file);
      expect([...preview.request.body.keys()]).toEqual(['file']);
      preview.flush({});
      service.confirmImport(kind, file).subscribe();
      const confirm = http.expectOne(`/api/${kind}/imports/confirm`);
      expect(confirm.request.body.get('file')).toBe(file);
      expect([...confirm.request.body.keys()]).toEqual(['file']);
      confirm.flush({});
      service.downloadImportTemplate(kind).subscribe();
      const template = http.expectOne(`/api/${kind}/imports/template`);
      expect(template.request.responseType).toBe('blob');
      template.flush(new Blob(['modelo']));
    }
    http.verify();
  });
});
