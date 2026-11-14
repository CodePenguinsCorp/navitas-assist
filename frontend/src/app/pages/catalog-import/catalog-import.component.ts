import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { CatalogImportKind, CatalogImportPreview, CatalogImportRow, CatalogImportStatus } from '../../core/models';
import { CatalogService } from '../../core/services/catalog.service';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { PaginationComponent } from '../../shared/pagination/pagination.component';
import { CustomSelectComponent } from '../../shared/form-controls/custom-select/custom-select.component';

@Component({
  selector: 'app-catalog-import',
  imports: [PageHeaderComponent, PaginationComponent, CustomSelectComponent],
  templateUrl: './catalog-import.component.html',
  styleUrl: './catalog-import.component.css'
})
export class CatalogImportComponent {
  private readonly service = inject(CatalogService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly kind = inject(ActivatedRoute).snapshot.data['catalogKind'] as CatalogImportKind;
  protected readonly origin = this.kind === 'clients' ? '/clientes' : '/produtos';
  protected readonly label = this.kind === 'clients' ? 'clientes' : 'produtos';
  protected readonly file = signal<File | null>(null);
  protected readonly preview = signal<CatalogImportPreview | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly filter = signal<CatalogImportStatus | 'all'>('all');
  protected readonly page = signal(0);
  protected readonly size = signal(10);
  protected readonly options = [{ value: 'all', label: 'Todas' }, { value: 'VALID', label: 'Válidas' }, { value: 'INVALID', label: 'Inválidas' }, { value: 'DUPLICATE', label: 'Duplicadas' }];
  protected readonly statuses: Record<CatalogImportStatus, string> = { VALID: 'Válida', INVALID: 'Inválida', DUPLICATE: 'Duplicada' };
  protected readonly filteredRows = computed(() => (this.preview()?.rows ?? []).filter(row => this.filter() === 'all' || row.status === this.filter()));
  protected readonly totalPages = computed(() => Math.ceil(this.filteredRows().length / this.size()));
  protected readonly visibleRows = computed(() => this.filteredRows().slice(this.page() * this.size(), (this.page() + 1) * this.size()));

  protected selectFile(event: Event): void {
    if (this.busy()) return;
    this.file.set((event.target as HTMLInputElement).files?.[0] ?? null);
    this.preview.set(null);
    this.error.set('');
    this.page.set(0);
  }

  protected downloadTemplate(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.service.downloadImportTemplate(this.kind).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false))).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${this.label}-modelo.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
      },
      error: error => this.showError(error)
    });
  }

  protected generatePreview(): void {
    const file = this.file();
    if (!file || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.preview.set(null);
    this.service.previewImport(this.kind, file).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false))).subscribe({
      next: preview => { this.preview.set(preview); this.changeFilter('all'); },
      error: error => this.showError(error)
    });
  }

  protected confirm(): void {
    const file = this.file();
    if (!file || !this.preview()?.validRows || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.service.confirmImport(this.kind, file).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false))).subscribe({
      next: result => {
        this.file.set(null);
        this.preview.set(null);
        const importSummary = `${result.importedRows} linha(s) importada(s). ${result.ignoredInvalidRows} inválida(s) e ${result.ignoredDuplicateRows} duplicada(s) ignorada(s).`;
        void this.router.navigate([this.origin], { state: { importSummary } });
      },
      error: error => this.showError(error)
    });
  }

  protected cancel(): void { if (!this.busy()) void this.router.navigate([this.origin]); }
  protected changeFilter(value: CatalogImportStatus | 'all'): void { this.filter.set(value); this.page.set(0); }
  protected changeSize(value: number): void { this.size.set(value); this.page.set(0); }
  protected identification(row: CatalogImportRow): string {
    return this.kind === 'clients' ? String(row.values['legalName'] ?? 'Sem razão social') : [row.values['sku'], row.values['name']].filter(Boolean).join(' · ') || 'Sem identificação';
  }
  private showError(error: unknown): void {
    const status = (error as { status?: number })?.status;
    this.error.set(status === 413 ? 'Arquivo grande demais. Reduza o tamanho do CSV e tente novamente.' : status === 415 ? 'Formato não suportado. Selecione um arquivo CSV.' : extractHttpErrorMessage(error, 'Não foi possível processar o CSV. Revise o arquivo e tente novamente.'));
  }
}
