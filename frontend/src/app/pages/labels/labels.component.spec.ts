import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { UserRole } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { RmaService } from '../../core/services/rma.service';
import { ScanService } from '../../core/services/scan.service';
import { LABEL_RMA } from '../../core/utils/scan-label.testing';
import { LabelsComponent } from './labels.component';

const CODE = { rmaId: 7, rmaCode: LABEL_RMA.code, token: 'TOKEN1', createdAt: '', createdBy: 'x' };

describe('LabelsComponent', () => {
  let fixture: ComponentFixture<LabelsComponent>;
  let scanService: Record<string, ReturnType<typeof vi.fn>>;

  async function setUp(role: UserRole): Promise<void> {
    try {
      localStorage.removeItem('navitas.label-fields');
    } catch {
      // ignore
    }
    scanService = {
      issue: vi.fn(() => of(CODE)),
      revoke: vi.fn(() => of(undefined)),
      imageUrl: vi.fn((code: { token: string }, format: string) => `/img/${format}/${code.token}`)
    };
    await TestBed.configureTestingModule({
      imports: [LabelsComponent],
      providers: [
        { provide: ScanService, useValue: scanService },
        { provide: RmaService, useValue: { getByCode: vi.fn(() => of(LABEL_RMA)) } },
        { provide: AuthService, useValue: { hasAnyRole: (roles: UserRole[]) => roles.includes(role) } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ code: LABEL_RMA.code }) } } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(LabelsComponent);
    fixture.detectChanges();
  }

  it('previews the label for the requested RMA with configurable fields', async () => {
    await setUp('TECHNICIAN');
    const element: HTMLElement = fixture.nativeElement;

    expect(scanService['issue']).toHaveBeenCalledWith(7);
    expect(element.textContent).toContain('Pré-visualização');
    expect(element.textContent).toContain('Serial S-1');
    expect(element.textContent).not.toContain('Revogar');

    const clientToggle = [...element.querySelectorAll('label')].find((label) => label.textContent?.trim() === 'Cliente')?.querySelector('input') as HTMLInputElement;
    clientToggle.click();
    fixture.detectChanges();
    expect(element.querySelector('.label-print-area')?.textContent).toContain('Cliente Sigiloso');
  });

  it('requires confirmation before revoking and reissues a new code', async () => {
    await setUp('SERVICE_DESK');
    const component = fixture.componentInstance as unknown as { confirmingRevoke: { set(value: boolean): void }; confirmRevoke(): void };

    expect(fixture.nativeElement.textContent).toContain('Revogar código');
    component.confirmingRevoke.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Etiquetas já impressas deixarão de funcionar');

    component.confirmRevoke();
    expect(scanService['revoke']).toHaveBeenCalledWith(7);
    expect(scanService['issue']).toHaveBeenCalledTimes(2);
  });
});
