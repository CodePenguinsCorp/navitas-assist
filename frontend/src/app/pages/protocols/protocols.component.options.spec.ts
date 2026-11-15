import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { CatalogService } from '../../core/services/catalog.service';
import { ProtocolService } from '../../core/services/protocol.service';
import { providePermissions } from '../../testing/permission-fixtures';
import { ProtocolsComponent } from './protocols.component';

describe('ProtocolsComponent product options', () => {
  let fixture: ComponentFixture<ProtocolsComponent>;
  let listProductOptions: ReturnType<typeof vi.fn>;
  const render = () => { fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck(); fixture.detectChanges(); };
  const text = () => (fixture.nativeElement.querySelector('[role="dialog"]')?.textContent as string | undefined)?.replace(/\s+/g, ' ') ?? '';
  const retry = () => Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent?.trim() === 'Tentar novamente');

  async function setup() {
    listProductOptions = vi.fn()
      .mockReturnValueOnce(throwError(() => ({ error: { message: 'Falha nos produtos.' } })))
      .mockReturnValue(of([{ id: 5, sku: 'SKU-5', name: 'Controlador' }]));
    await TestBed.configureTestingModule({ imports: [ProtocolsComponent], providers: [
      providePermissions(['protocolos.ver', 'protocolos.catalogo']),
      { provide: ProtocolService, useValue: { listTemplates: () => of([]) } },
      { provide: CatalogService, useValue: { listProductOptions } }
    ] }).compileComponents();
    fixture = TestBed.createComponent(ProtocolsComponent); render();
    (fixture.componentInstance as unknown as { openCreateModal(): void }).openCreateModal(); render();
  }

  it('shows an error with retry when the product options fail and recovers on retry', async () => {
    await setup();
    expect(text()).toContain('Falha nos produtos.');
    expect(retry()).toBeDefined();
    retry()!.click(); render();
    expect(listProductOptions).toHaveBeenCalledTimes(2);
    expect(text()).not.toContain('Falha nos produtos.');
    expect(retry()).toBeUndefined();
    const options = (fixture.componentInstance as unknown as { productOptions(): { value: number | null; label: string }[] }).productOptions();
    expect(options.map((option) => option.label)).toContain('SKU-5 · Controlador');
  });
});
