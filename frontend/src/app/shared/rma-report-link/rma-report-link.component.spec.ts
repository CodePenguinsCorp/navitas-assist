import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RmaReportLinkComponent } from './rma-report-link.component';

describe('RmaReportLinkComponent', () => {
  let fixture: ComponentFixture<RmaReportLinkComponent>;
  let http: HttpTestingController;
  const button = () => (fixture.nativeElement as HTMLElement).querySelector('button') as HTMLButtonElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RmaReportLinkComponent], providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(RmaReportLinkComponent);
    fixture.componentRef.setInput('rmaId', 7);
    fixture.componentRef.setInput('code', 'OS-2026/7');
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('downloads the PDF as an authenticated blob and saves it with the server file name', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:laudo');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    expect(button().textContent).toContain('Laudo (PDF)');
    expect(button().getAttribute('aria-label')).toBe('Baixar laudo de OS-2026/7');
    button().click();
    fixture.detectChanges();
    expect(button().disabled).toBe(true);
    const request = http.expectOne('/api/rmas/7/report.pdf');
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['%PDF']), { headers: { 'Content-Disposition': 'attachment; filename="laudo-OS-2026-7.pdf"' } });
    fixture.detectChanges();

    expect(createObjectURL).toHaveBeenCalled();
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('laudo-OS-2026-7.pdf');
    expect(button().disabled).toBe(false);
    click.mockRestore();
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it('shows a short error when the download fails', () => {
    button().click();
    http.expectOne('/api/rmas/7/report.pdf').flush(new Blob([]), { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Não foi possível baixar o laudo.');
  });
});
