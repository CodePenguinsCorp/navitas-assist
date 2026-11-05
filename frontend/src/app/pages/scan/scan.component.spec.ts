import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { RmaResponse, UserRole } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { RmaService } from '../../core/services/rma.service';
import { ScanService } from '../../core/services/scan.service';
import { LABEL_RMA } from '../../core/utils/scan-label.testing';
import { ScanComponent } from './scan.component';

const RMA = { ...LABEL_RMA, status: 'RECEIVED', assigneeName: null, serialNumber: null, batchNumber: null } as RmaResponse;

interface Harness {
  open(value: string, source: 'CAMERA' | 'SCANNER' | 'MANUAL'): void;
  selectTarget(value: string): void;
  requestStatusChange(): void;
  confirmStatusChange(): void;
  confirming(): boolean;
  errorMessage(): string;
  rma(): RmaResponse | null;
}

describe('ScanComponent', () => {
  let fixture: ComponentFixture<ScanComponent>;
  let component: Harness;
  let scanService: Record<string, ReturnType<typeof vi.fn>>;
  let rmaService: Record<string, ReturnType<typeof vi.fn>>;

  async function setUp(role: UserRole): Promise<void> {
    scanService = {
      resolve: vi.fn((code: string) => code === 'GOODTOKEN' ? of(RMA) : throwError(() => ({ status: 404 }))),
      changeStatus: vi.fn(() => of({ ...RMA, status: 'TRIAGE' }))
    };
    rmaService = { getByCode: vi.fn(() => of(RMA)), updateStatusInBulk: vi.fn(() => of({ ...RMA, status: 'TRIAGE' })) };
    await TestBed.configureTestingModule({
      imports: [ScanComponent],
      providers: [
        { provide: ScanService, useValue: scanService },
        { provide: RmaService, useValue: rmaService },
        { provide: AuthService, useValue: { hasAnyRole: (roles: UserRole[]) => roles.includes(role) } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(ScanComponent);
    component = fixture.componentInstance as unknown as Harness;
    fixture.detectChanges();
  }

  it('opens the scanned RMA directly, without extra steps', async () => {
    await setUp('VIEWER');
    component.open(' GOODTOKEN ', 'SCANNER');
    fixture.detectChanges();

    expect(scanService['resolve']).toHaveBeenCalledWith('GOODTOKEN');
    expect(fixture.nativeElement.textContent).toContain('RMA-2026-000007');
    expect(fixture.nativeElement.textContent).not.toContain('Alterar status');
  });

  it('uses the RMA code as manual fallback and shows one message for any unknown code', async () => {
    await setUp('TECHNICIAN');
    component.open('rma-2026-000007', 'MANUAL');
    expect(rmaService['getByCode']).toHaveBeenCalledWith('rma-2026-000007');
    expect(scanService['resolve']).not.toHaveBeenCalled();

    component.open('REVOKEDTOKEN', 'CAMERA');
    expect(component.rma()).toBeNull();
    expect(component.errorMessage()).toBe('Código não encontrado. Confira a etiqueta ou digite o código do RMA.');
  });

  it('asks for confirmation before changing status and sends what the user saw', async () => {
    await setUp('TECHNICIAN');
    component.open('GOODTOKEN', 'CAMERA');
    component.selectTarget('TRIAGE');
    component.requestStatusChange();
    fixture.detectChanges();

    expect(component.confirming()).toBe(true);
    expect(scanService['changeStatus']).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Confirmar mudança de');

    component.confirmStatusChange();
    expect(scanService['changeStatus']).toHaveBeenCalledWith('GOODTOKEN', { expectedStatus: 'RECEIVED', status: 'TRIAGE', note: null, source: 'CAMERA', confirmed: true });
    expect(component.rma()?.status).toBe('TRIAGE');
  });
});
