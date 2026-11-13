import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Subscription, finalize } from 'rxjs';
import { FAILURE_TYPE_LABELS, RMA_STATUS_FLOW, RMA_STATUS_LABELS, WARRANTY_STATUS_LABELS } from '../../core/mock-data';
import { RmaReportFilters, RmaReportPageResponse, RmaReportRow, RmaReportSummaryResponse, RmaStatus } from '../../core/models';
import { CatalogService } from '../../core/services/catalog.service';
import { PermissionService } from '../../core/services/permission.service';
import { ReportService } from '../../core/services/report.service';
import { formatDateOnly, todayInputValue } from '../../core/utils/date';
import { saveDownload } from '../../core/utils/download';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import { formatDuration } from '../../core/utils/duration';
import { DEFAULT_PAGE_SIZE } from '../../core/utils/pagination';
import { CustomSelectComponent, CustomSelectOption } from '../../shared/form-controls/custom-select/custom-select.component';
import { DatePickerComponent } from '../../shared/form-controls/date-picker/date-picker.component';
import { IconComponent } from '../../shared/icon/icon.component';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { PaginationComponent } from '../../shared/pagination/pagination.component';
import { RmaReportLinkComponent } from '../../shared/rma-report-link/rma-report-link.component';

type ReportTab = 'summary' | 'failures' | 'recurrence' | 'rmas';

const DEFAULT_PERIOD_DAYS = 90;
const MAX_PERIOD_DAYS = 366;

@Component({
  selector: 'app-reports',
  imports: [NgTemplateOutlet, ReactiveFormsModule, CustomSelectComponent, DatePickerComponent, IconComponent, PageHeaderComponent, PaginationComponent, RmaReportLinkComponent],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.css'
})
export class ReportsComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly reportService = inject(ReportService);
  private readonly catalogService = inject(CatalogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly permissions = inject(PermissionService);
  private summaryRequest?: Subscription;
  private listRequest?: Subscription;
  /** Filters of the last consultation; paging and exports reuse them, not the form being edited. */
  private applied: RmaReportFilters = {};

  protected readonly form = this.formBuilder.nonNullable.group({
    entryFrom: shiftDate(todayInputValue(), -(DEFAULT_PERIOD_DAYS - 1)), entryTo: todayInputValue(), status: '' as RmaStatus | '',
    clientId: this.formBuilder.control<number | null>(null)
  });
  protected readonly tab = signal<ReportTab>('summary');
  protected readonly loading = signal(false);
  protected readonly listLoading = signal(false);
  protected readonly exporting = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly exportError = signal('');
  protected readonly periodError = signal('');
  protected readonly clientsError = signal('');
  protected readonly summary = signal<RmaReportSummaryResponse | null>(null);
  protected readonly list = signal<RmaReportPageResponse | null>(null);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  protected readonly canViewRma = computed(() => this.permissions.hasPermission('rma.ver'));
  protected readonly clientOptions = signal<CustomSelectOption[]>([{ value: null, label: 'Todos os clientes' }]);
  protected readonly tabs: { value: ReportTab; label: string }[] = [
    { value: 'summary', label: 'Resumo' }, { value: 'failures', label: 'Falhas' },
    { value: 'recurrence', label: 'Recorrência' }, { value: 'rmas', label: 'RMAs' }
  ];
  protected readonly statusOptions: CustomSelectOption[] = [
    { value: '', label: 'Todos os status' }, ...RMA_STATUS_FLOW.map((value) => ({ value, label: RMA_STATUS_LABELS[value] }))
  ];
  protected readonly statusLabels = RMA_STATUS_LABELS;
  protected readonly failureLabels = FAILURE_TYPE_LABELS;
  protected readonly formatDate = formatDateOnly;
  protected readonly duration = formatDuration;

  constructor() {
    this.loadClients();
    this.consult();
  }

  protected loadClients(): void {
    this.clientsError.set('');
    this.catalogService.listClientOptions().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (clients) => this.clientOptions.set([{ value: null, label: 'Todos os clientes' },
        ...clients.map((client) => ({ value: client.id, label: client.legalName }))]),
      error: () => this.clientsError.set('Não foi possível carregar os clientes para o filtro.')
    });
  }

  protected consult(): void {
    this.periodError.set('');
    const { entryFrom, entryTo, status, clientId } = this.form.getRawValue();
    if (entryFrom && entryTo && entryFrom > entryTo) {
      this.periodError.set('A data inicial deve ser anterior ou igual à data final.');
      return;
    }
    if (entryFrom && entryTo && daysBetween(entryFrom, entryTo) + 1 > MAX_PERIOD_DAYS) {
      this.periodError.set(`O período deve ter no máximo ${MAX_PERIOD_DAYS} dias.`);
      return;
    }
    this.applied = { entryFrom: entryFrom || undefined, entryTo: entryTo || undefined, status: status || undefined, clientId: clientId ?? undefined };
    this.summaryRequest?.unsubscribe();
    this.errorMessage.set('');
    this.exportError.set('');
    this.summary.set(null);
    // A página anterior pertence a outros filtros: some até a nova chegar (ou falhar).
    this.list.set(null);
    this.loading.set(true);
    this.summaryRequest = this.reportService.summary(this.applied)
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false))).subscribe({
        next: (summary) => this.summary.set(summary),
        error: () => this.errorMessage.set('Não foi possível carregar os relatórios.')
      });
    this.loadPage(0);
  }

  /** Volta aos filtros iniciais (últimos 90 dias, todos os status e clientes) e consulta. */
  protected clearFilters(): void {
    this.form.reset({ entryFrom: shiftDate(todayInputValue(), -(DEFAULT_PERIOD_DAYS - 1)), entryTo: todayInputValue(), status: '', clientId: null });
    this.consult();
  }

  protected loadPage(page: number): void {
    this.listRequest?.unsubscribe();
    this.listLoading.set(true);
    this.listRequest = this.reportService.list(this.applied, page, this.pageSize())
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.listLoading.set(false))).subscribe({
        next: (list) => this.list.set(list),
        error: () => this.errorMessage.set('Não foi possível carregar os relatórios.')
      });
  }

  protected changePageSize(size: number): void {
    this.pageSize.set(size);
    this.loadPage(0);
  }

  protected selectTab(tab: ReportTab): void {
    this.tab.set(tab);
  }

  /** Tab keyboard contract: arrows move with wrap-around, Home and End go to the ends. */
  protected onTabKeydown(event: KeyboardEvent): void {
    const values = this.tabs.map((tab) => tab.value);
    const current = values.indexOf(this.tab());
    const next = event.key === 'ArrowRight' ? (current + 1) % values.length
      : event.key === 'ArrowLeft' ? (current - 1 + values.length) % values.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? values.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    this.selectTab(values[next]);
    const tabs = (event.currentTarget as HTMLElement).closest('[role="tablist"]')?.querySelectorAll<HTMLElement>('[role="tab"]');
    tabs?.[next]?.focus();
  }

  protected exportCsv(): void {
    const rmas = this.tab() === 'rmas';
    this.exporting.set(true);
    this.exportError.set('');
    (rmas ? this.reportService.exportRmas(this.applied) : this.reportService.exportSummary(this.applied))
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.exporting.set(false))).subscribe({
        next: (response) => saveDownload(response, rmas ? 'rmas.csv' : 'resumo-rmas.csv'),
        error: (error: unknown) => {
          void exportErrorMessage(error).then((message) => this.exportError.set(message));
        }
      });
  }

  protected percent(part: number, base: number): string {
    return base ? `${(Math.round((part / base) * 1000) / 10).toFixed(1).replace('.', ',')}%` : '—';
  }

  protected barWidth(count: number, rows: { count: number }[]): number {
    const max = rows.reduce((value, row) => Math.max(value, row.count), 0);
    return max ? Math.round((count / max) * 100) : 0;
  }

  protected productLabel(row: RmaReportRow): string {
    return row.itemCount > 1 ? `${row.productName} +${row.itemCount - 1}` : row.productName;
  }

  protected warrantyLabel(row: RmaReportRow): string {
    return row.warrantyStatuses.map((status) => WARRANTY_STATUS_LABELS[status]).join(', ');
  }

  protected periodLabel(data: { entryFrom: string; entryTo: string }): string {
    return `${formatDateOnly(data.entryFrom)} a ${formatDateOnly(data.entryTo)}`;
  }
}

const EXPORT_FALLBACK = 'Não foi possível exportar o CSV. Reduza o período ou os filtros e tente novamente.';

/** The CSV request expects a blob, so the backend's JSON error arrives as a blob too: read it for the real message. */
async function exportErrorMessage(error: unknown): Promise<string> {
  const body = (error as { error?: unknown } | null)?.error;
  if (body instanceof Blob) {
    try {
      return extractHttpErrorMessage({ error: JSON.parse(await body.text()) }, EXPORT_FALLBACK);
    } catch {
      return EXPORT_FALLBACK;
    }
  }
  return extractHttpErrorMessage(error, EXPORT_FALLBACK);
}

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}
