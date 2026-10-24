import { TestBed } from '@angular/core/testing';
import { ScanService } from '../../core/services/scan.service';
import { LABEL_RMA } from '../../core/utils/scan-label.testing';
import { RmaLabelComponent } from './rma-label.component';

describe('RmaLabelComponent', () => {
  it('renders the printable label preview from the label model', async () => {
    await TestBed.configureTestingModule({
      imports: [RmaLabelComponent],
      providers: [{ provide: ScanService, useValue: { imageUrl: (code: { token: string }, format: string) => `/img/${format}/${code.token}` } }]
    }).compileComponents();
    const fixture = TestBed.createComponent(RmaLabelComponent);
    fixture.componentRef.setInput('rma', LABEL_RMA);
    fixture.componentRef.setInput('scanCode', { rmaId: 7, rmaCode: LABEL_RMA.code, token: 'TOKEN', createdAt: '', createdBy: 'x' });
    fixture.componentRef.setInput('fields', ['trackable']);
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('RMA-2026-000007');
    expect(element.textContent).toContain('CTRL-1 | Controlador');
    expect(element.textContent).toContain('Serial S-1');
    expect(element.textContent).not.toContain('Cliente Sigiloso');
    const images = [...element.querySelectorAll('img')].map((image) => image.getAttribute('src'));
    expect(images).toEqual(['/img/qr/TOKEN', '/img/barcode/TOKEN']);

    fixture.componentRef.setInput('fields', ['trackable', 'client']);
    fixture.detectChanges();
    expect(element.textContent).toContain('Cliente Sigiloso');
  });
});
