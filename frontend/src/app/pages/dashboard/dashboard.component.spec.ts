import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { RmaResponse, WarrantyStatus } from '../../core/models';
import { CatalogService } from '../../core/services/catalog.service';
import { RmaService } from '../../core/services/rma.service';
import { DashboardComponent } from './dashboard.component';
import { profilePermissions, providePermissions } from '../../testing/permission-fixtures';

describe('Dashboard timestamp display', () => {
  it('renders audit and recent instants in Sao Paulo while preserving the civil entry date', async () => {
    const rma: RmaResponse = {
      id: 1, code: 'RMA-2026-000001', clientId: 1, clientName: 'Cliente',
      items: [{ id: 1, productId: 2, productName: 'Produto', productSku: 'SKU-2', batchNumber: null,
        serialNumber: 'SER-2', manufacturedAt: null, warrantyMonths: 12, warrantyExpiresAt: null, warrantyStatus: WarrantyStatus.PENDING }],
      productId: 2, productName: 'Produto', productSku: 'SKU-2', batchNumber: null, serialNumber: 'SER-2',
      manufacturedAt: null, purchaseDate: null, purchaseDateUnknown: true, entryDate: '2026-10-20',
      invoiceNumber: null, receivedBy: 'tester', reportedFailure: 'Falha', receivedAccessories: null,
      physicalCondition: null, priority: 'MEDIUM', status: 'RECEIVED', assigneeId: null, assigneeName: null,
      repairSummary: null, replacedPartsSummary: null, testSummary: null, shippedAt: null, carrier: null,
      trackingCode: null, diagnosis: null, assignmentHistory: [],
      statusHistory: [{ status: 'RECEIVED', changedBy: 'tester', changedAt: '2026-10-20T02:30:00Z', note: null }],
      currentBlock: null, blockHistory: [],
      dueDate: null, deadline: { status: 'NO_DUE_DATE', dueSoonFrom: null, daysUntilDue: null }, stagePeriods: [{ status: 'RECEIVED', enteredAt: '2026-10-20T02:30:00Z', leftAt: null, durationSeconds: 0 }], dueDateHistory: [],
      createdAt: '2026-10-20T02:30:00Z', updatedAt: '2026-12-31T23:15:00-02:00',
    };
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        providePermissions([]),
        { provide: RmaService, useValue: { listBoard: () => of([rma]), getSummary: () => of({ total: 1, ongoing: 1, highPriority: 0 }) } },
        { provide: CatalogService, useValue: { listClientOptions: () => of([]), listProductOptions: () => of([]), getClientSummary: () => of({ total: 0, withContact: 0, withDocument: 0, withEmail: 0 }), getProductSummary: () => of({ total: 0, withFirmware: 0, averageWarrantyMonths: 0, categories: [] }), getUserSummary: () => of({ total: 0, active: 0, admins: 0, roles: 0 }) } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    const tables = page.querySelectorAll('table');

    expect(page.querySelector('.timeline-entry time')?.textContent?.trim()).toBe('19/10/2026, 23:30');
    expect(tables[0].querySelector('tbody td:nth-child(3)')?.textContent?.trim()).toBe('20/10/2026');
    expect(tables[1].querySelector('tbody td:last-child')?.textContent?.trim()).toBe('31/12/2026, 22:15');
    expect(rma.statusHistory[0].changedAt).toBe('2026-10-20T02:30:00Z');
    expect(rma.updatedAt).toBe('2026-12-31T23:15:00-02:00');
  });
});
