import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Subscription, finalize } from 'rxjs';
import { FAILURE_CAUSE_LABELS, FAILURE_TYPE_LABELS, RMA_STATUS_FLOW, RMA_STATUS_LABELS, WARRANTY_STATUS_LABELS } from '../../core/mock-data';
import { RmaReportResponse, RmaStatus } from '../../core/models';
import { CatalogService } from '../../core/services/catalog.service';
import { ReportService } from '../../core/services/report.service';
import { formatDateOnly, todayInputValue } from '../../core/utils/date';
import { purchaseFact, warrantyExpiryLabel, warrantyTermLabel } from '../../core/utils/rma-detail';
import { CustomSelectComponent, CustomSelectOption } from '../../shared/form-controls/custom-select/custom-select.component';
import { DatePickerComponent } from '../../shared/form-controls/date-picker/date-picker.component';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';

type ReportType = 'technical' | 'aging' | 'warranty' | 'returns';

const DEFAULT_PERIOD_DAYS = 90;
const MAX_PERIOD_DAYS = 366;

@Component({
  selector: 'app-reports',
  imports: [ReactiveFormsModule, CustomSelectComponent, DatePickerComponent, PageHeaderComponent],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.css'
})
export class ReportsComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly reportService = inject(ReportService);
  private readonly catalogService = inject(CatalogService);
  private readonly destroyRef = inject(DestroyRef);
  private request?: Subscription;

  protected readonly form = this.formBuilder.nonNullable.group({
    report: 'technical' as ReportType, entryFrom: shiftDate(todayInputValue(), -(DEFAULT_PERIOD_DAYS - 1)), entryTo: todayInputValue(), status: '' as RmaStatus | '',
    clientId: this.formBuilder.control<number | null>(null)
  });
  protected readonly reportType = toSignal(this.form.controls.report.valueChanges, { initialValue: this.form.controls.report.value });
  protected readonly loading = signal(false);
  /** Server failure only; local period validation lives in periodError. */
  protected readonly errorMessage = signal('');
  protected readonly periodError = signal('');
  /** Labels of the values submitted with the request that produced the current report. */
  protected readonly appliedFilters = signal<{ status: string; client: string } | null>(null);
  protected readonly clientsError = signal('');
  protected readonly report = signal<RmaReportResponse | null>(null);
  protected readonly clientOptions = signal<CustomSelectOption[]>([{ value: null, label: 'Todos os clientes' }]);
  protected readonly reportOptions: CustomSelectOption<ReportType>[] = [
    { value: 'technical', label: 'Laudo técnico' }, { value: 'aging', label: 'Tempo por etapa' },
    { value: 'warranty', label: 'Garantia por produto' }, { value: 'returns', label: 'Devoluções' }
  ];
  protected readonly statusOptions: CustomSelectOption[] = [
    { value: '', label: 'Todos os status' }, ...RMA_STATUS_FLOW.map((value) => ({ value, label: RMA_STATUS_LABELS[value] }))
  ];
  protected readonly statusLabels = RMA_STATUS_LABELS;
  protected readonly warrantyLabels = WARRANTY_STATUS_LABELS;
  protected readonly failureLabels = FAILURE_TYPE_LABELS;
  protected readonly causeLabels = FAILURE_CAUSE_LABELS;
  protected readonly formatDate = formatDateOnly;
  protected readonly warrantyTermLabel = warrantyTermLabel;
  protected readonly warrantyExpiryLabel = warrantyExpiryLabel;
  protected readonly purchaseFact = purchaseFact;
  protected readonly rmas = computed(() => this.report()?.rmas ?? []);
  protected readonly activeRmas = computed(() => this.rmas().filter((rma) => rma.sla.status !== 'CLOSED'));
  protected readonly returns = computed(() => this.rmas().filter((rma) => rma.status === 'RETURNED'));
  protected readonly aging = computed(() => RMA_STATUS_FLOW.flatMap((status) => {
    const records = this.activeRmas().filter((rma) => rma.status === status);
    if (!records.length) return [];
    const seconds = records.map((rma) => rma.sla.elapsedSeconds);
    return [{ status, count: records.length, average: Math.floor(seconds.reduce((sum, value) => sum + value, 0) / seconds.length),
      maximum: seconds.reduce((maximum, value) => Math.max(maximum, value), 0) }];
  }));

  constructor() {
    this.loadClients();
    this.loadReports();
  }

  protected loadClients(): void {
    this.clientsError.set('');
    this.catalogService.listClientOptions().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (clients) => this.clientOptions.set([{ value: null, label: 'Todos os clientes' },
        ...clients.map((client) => ({ value: client.id, label: client.legalName }))]),
      error: () => this.clientsError.set('Não foi possível carregar os clientes para o filtro.')
    });
  }

  protected loadReports(): void {
    this.request?.unsubscribe();
    this.report.set(null);
    this.errorMessage.set('');
    this.periodError.set('');
    const { entryFrom, entryTo, status, clientId } = this.form.getRawValue();
    if (entryFrom && entryTo && entryFrom > entryTo) {
      this.periodError.set('A data inicial deve ser anterior ou igual à data final.');
      return;
    }
    if (entryFrom && entryTo && daysBetween(entryFrom, entryTo) + 1 > MAX_PERIOD_DAYS) {
      this.periodError.set(`O período do relatório deve ter no máximo ${MAX_PERIOD_DAYS} dias.`);
      return;
    }
    this.appliedFilters.set({
      status: this.statusOptions.find((option) => option.value === status)?.label ?? 'Todos os status',
      client: this.clientOptions().find((option) => option.value === clientId)?.label ?? 'Todos os clientes'
    });
    this.loading.set(true);
    this.request = this.reportService.list({ entryFrom: entryFrom || undefined, entryTo: entryTo || undefined,
      status: status || undefined, clientId: clientId ?? undefined })
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false))).subscribe({
        next: (report) => this.report.set(report),
        error: () => this.errorMessage.set('Não foi possível carregar os relatórios. Tente novamente.')
      });
  }

  protected selectReport(type: ReportType): void {
    this.form.controls.report.setValue(type);
  }

  /** Tab keyboard contract: arrows move with wrap-around, Home and End go to the ends. */
  protected onTabKeydown(event: KeyboardEvent): void {
    const values = this.reportOptions.map((option) => option.value);
    const current = values.indexOf(this.form.controls.report.value);
    const next = event.key === 'ArrowRight' ? (current + 1) % values.length
      : event.key === 'ArrowLeft' ? (current - 1 + values.length) % values.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? values.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    this.selectReport(values[next]);
    const tabs = (event.currentTarget as HTMLElement).closest('[role="tablist"]')?.querySelectorAll<HTMLElement>('[role="tab"]');
    tabs?.[next]?.focus();
  }

  protected periodDescribedBy(): string {
    return this.periodError() ? 'report-period-help report-period-error' : 'report-period-help';
  }

  protected formatInstant(value: string): string {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  }

  protected duration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const days = Math.floor(minutes / 1440);
    return `${days ? `${days}d ` : ''}${Math.floor(minutes % 1440 / 60)}h ${minutes % 60}min`;
  }
}

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}
