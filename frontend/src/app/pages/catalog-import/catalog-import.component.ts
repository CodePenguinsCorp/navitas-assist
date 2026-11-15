import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { CatalogImportKind, CatalogImportPreview, CatalogImportRow, CatalogImportStatus } from '../../core/models';
import { CatalogService } from '../../core/services/catalog.service';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import { IconComponent } from '../../shared/icon/icon.component';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { PaginationComponent } from '../../shared/pagination/pagination.component';

@Component({
  selector: 'app-catalog-import',
  imports: [IconComponent, PageHeaderComponent, PaginationComponent],
  templateUrl: './catalog-import.component.html',
  styleUrl: './catalog-import.component.css'
})
export class CatalogImportComponent {
  private readonly service = inject(CatalogService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly kind = inject(ActivatedRoute).snapshot.data['catalogKind'] as CatalogImportKind;
  protected readonly origin = this.kind === 'clients' ? '/clientes' : '/produtos';
  protected readonly backLabel = `Voltar para ${this.kind === 'clients' ? 'Clientes' : 'Produtos'}`;
  protected readonly label = this.kind === 'clients' ? 'clientes' : 'produtos';
  protected readonly file = signal<File | null>(null);
  protected readonly preview = signal<CatalogImportPreview | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly filter = signal<CatalogImportStatus | 'all'>('all');
  protected readonly page = signal(0);
  protected readonly size = signal(10);
  protected readonly metrics = [
    { status: 'VALID', field: 'validRows', label: 'Válida' },
    { status: 'INVALID', field: 'invalidRows', label: 'Inválida' },
    { status: 'DUPLICATE', field: 'duplicateRows', label: 'Duplicada' }
  ] as const;
  protected readonly statuses: Record<CatalogImportStatus, string> = { VALID: 'Válida', INVALID: 'Inválida', DUPLICATE: 'Duplicada' };
  protected readonly tones: Record<CatalogImportStatus, string> = { VALID: 'success', INVALID: 'danger', DUPLICATE: 'warning' };
  protected counted(count: number, singular: string, plural = singular + 's'): string {
    return `${count} ${count === 1 ? singular : plural}`;
  }
  protected readonly filterLabel = computed(() => {
    const status = this.filter();
    return status === 'all' ? 'Todas as situações' : this.statuses[status];
  });
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
        const ignored = result.ignoredInvalidRows + result.ignoredDuplicateRows;
        const importSummary = `${this.counted(result.importedRows, 'linha importada', 'linhas importadas')}.${ignored ? ` ${this.counted(ignored, 'ignorada', 'ignoradas')}.` : ''}`;
        void this.router.navigate([this.origin], { state: { importSummary } });
      },
      error: error => this.showError(error)
    });
  }

  protected toggleFilter(value: CatalogImportStatus): void { this.changeFilter(this.filter() === value ? 'all' : value); }
  protected changeFilter(value: CatalogImportStatus | 'all'): void { this.filter.set(value); this.page.set(0); }
  protected changeSize(value: number): void { this.size.set(value); this.page.set(0); }
  protected identification(row: CatalogImportRow): string {
    return this.kind === 'clients' ? String(row.values['legalName'] ?? 'Sem razão social') : [row.values['sku'], row.values['name']].filter(Boolean).join(' - ') || 'Sem identificação';
  }
  protected fieldLabel(field: string): string {
    const labels: Record<string, string> = {
      legalName: 'Razão social', tradeName: 'Nome fantasia', documentNumber: 'Documento', email: 'E-mail',
      phone: 'Telefone', address: 'Endereço', notes: 'Observações', sku: 'Código do produto', name: 'Nome',
      category: 'Categoria', hardwareVersion: 'Versão de hardware', firmwareVersion: 'Versão de firmware',
      defaultWarrantyMonths: 'Garantia em meses', technicalNotes: 'Notas técnicas'
    };
    return labels[field] ?? 'Linha';
  }
  private showError(error: unknown): void {
    const status = (error as { status?: number })?.status;
    const message = extractHttpErrorMessage(error, 'Não foi possível processar o CSV. Revise o arquivo e tente novamente.');
    if (/UTF-?8/i.test(message)) {
      this.error.set('Não foi possível ler a codificação do arquivo. Salve o arquivo como CSV UTF-8 e tente novamente.');
      return;
    }
    this.error.set(status === 413 ? 'Arquivo grande demais. Reduza o tamanho do CSV e tente novamente.' : status === 415 ? 'Formato não suportado. Selecione um arquivo CSV.' : message);
  }
}
