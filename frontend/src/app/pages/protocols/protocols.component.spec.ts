import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CatalogService } from '../../core/services/catalog.service';
import { ProtocolService } from '../../core/services/protocol.service';
import { expectCancelBeforePrimary } from '../../testing/dialog-actions';
import { ProtocolsComponent } from './protocols.component';

interface ProtocolsHarness {
  openCreateModal(): void;
}

describe('ProtocolsComponent', () => {
  let fixture: ComponentFixture<ProtocolsComponent>;
  let component: ProtocolsHarness;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProtocolsComponent],
      providers: [
        { provide: ProtocolService, useValue: { listTemplates: vi.fn(() => of([])) } },
        { provide: CatalogService, useValue: { listProductOptions: vi.fn(() => of([])) } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ProtocolsComponent);
    component = fixture.componentInstance as unknown as ProtocolsHarness;
    fixture.detectChanges();
  });

  it('shows Cancelar before the primary action in the form dialog', () => {
    component.openCreateModal();
    fixture.detectChanges();

    expectCancelBeforePrimary(fixture.nativeElement);
  });
});
