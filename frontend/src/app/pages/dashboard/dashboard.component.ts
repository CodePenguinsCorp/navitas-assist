import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subscription, finalize, forkJoin, of } from 'rxjs';
import {
  CLOSED_RMA_STATUSES,
  RMA_PRIORITY_LABELS,
  RMA_STATUS_LABELS
} from '../../core/mock-data';
import {
  RmaPriority,
  RmaResponse,
  RmaStatus,
  UserSummaryResponse,
  WarrantyStatus
} from '../../core/models';
import { PermissionService } from '../../core/services/permission.service';
import { CatalogService } from '../../core/services/catalog.service';
import { RmaService } from '../../core/services/rma.service';
import { IconComponent, IconName } from '../../shared/icon/icon.component';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { compareRmasForQueue, initialsOf } from '../../core/utils/rma-ui';
import { businessToday, deadlineStatus } from '../../core/utils/rma-deadline';
import { formatBusinessDateTime as formatDateTime, formatDateOnly } from '../../core/utils/date';

const QUEUE_SIZE = 5;

interface DashboardIndicator {
  label: string;
  value: string;
  detail: string;
  icon: IconName;
  tone: 'brand' | 'sky' | 'danger' | 'success' | 'violet';
  /** The catalog card shows a text value instead of a number. */
  catalog?: boolean;
}

interface QueueRow {
  id: number;
  code: string;
  client: string;
  entryDate: string;
  status: string;
  statusCode: RmaStatus;
  priority: string;
  priorityCode: RmaPriority;
}

interface AuditRow {
  id: string;
  rmaId: number;
  code: string;
  statusCode: RmaStatus;
  label: string;
  by: string;
  note: string | null;
  time: string;
}

interface RecentRmaRow {
  id: number;
  code: string;
  client: string;
  owner: string;
  ownerInitials: string;
  hasOwner: boolean;
  updatedAt: string;
}

@Component({
  selector: 'app-dashboard',
  imports: [IconComponent, PageHeaderComponent, RouterLink],
  templateUrl: './dashboard.component.html',
  styles: [`
    :host { display: block; }

    .dashboard-summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    /* Each indicator carries its own tone: a solid icon block and a wash of the same color. */
    .dashboard-summary__item {
      --tone: var(--brand-blue);
      position: relative;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: start;
      gap: var(--space-1) var(--space-3);
      padding: var(--space-4);
      overflow: hidden;
      border-color: color-mix(in srgb, var(--tone) 22%, var(--line));
      background:
        radial-gradient(140% 120% at 100% 0%, color-mix(in srgb, var(--tone) 14%, transparent) 0%, transparent 60%),
        var(--surface);
    }

    .dashboard-summary__item[data-tone='sky'] { --tone: var(--tone-sky); }
    .dashboard-summary__item[data-tone='danger'] { --tone: var(--tone-danger); }
    .dashboard-summary__item[data-tone='success'] { --tone: var(--tone-success); }
    .dashboard-summary__item[data-tone='violet'] { --tone: var(--tone-violet); }

    .dashboard-summary__item > .icon-tile {
      grid-row: span 2;
      width: 44px;
      height: 44px;
      border-radius: var(--radius-md);
      background: var(--tone);
      color: #ffffff;
      box-shadow: 0 6px 14px color-mix(in srgb, var(--tone) 30%, transparent);
    }

    .dashboard-summary__label {
      color: var(--text);
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-semibold);
    }

    .dashboard-summary__value {
      margin: 0;
      color: var(--muted);
      font-size: 0.88rem;
      overflow-wrap: anywhere;
    }

    .dashboard-summary__value strong {
      display: inline-block;
      margin-right: var(--space-1);
      color: var(--brand-dark);
      font-size: 1.75rem;
      font-weight: 800;
      line-height: 1.1;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
    }

    .dashboard-summary__item--catalog .dashboard-summary__value strong {
      font-size: 1.05rem;
      font-weight: var(--font-weight-bold);
      letter-spacing: 0;
    }

    .dashboard-grid > .panel,
    .dashboard-recent { min-width: 0; }

    .dashboard-scope {
      margin: var(--space-1) 0 0;
      color: var(--muted);
      font-size: 0.85rem;
    }

    .dashboard-audit__body {
      display: grid;
      gap: var(--space-2);
      min-width: 0;
    }

    .dashboard-audit__note {
      margin: 0;
      padding: var(--space-1) var(--space-3);
      border-left: 3px solid var(--line);
      border-radius: 0 var(--radius-xs) var(--radius-xs) 0;
      background: var(--surface-alt);
      font-size: 0.85rem;
      overflow-wrap: anywhere;
    }
  `]
})
export class DashboardComponent {
  private readonly permissions = inject(PermissionService);
  private readonly catalogService = inject(CatalogService);
  private readonly rmaService = inject(RmaService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isAdmin = computed(() => this.permissions.hasPermission('usuarios.gerir'));
  private loadRequest?: Subscription;

  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);
  protected readonly hasLoaded = signal(false);
  protected readonly loadErrorMessage = signal('');

  private readonly rmasSignal = signal<RmaResponse[]>([]);
  private readonly clientTotalSignal = signal(0);
  private readonly productTotalSignal = signal(0);
  private readonly userTotalSignal = signal(0);

  private readonly activeRmas = computed(() =>
    this.rmasSignal().filter((rma) => !CLOSED_RMA_STATUSES.includes(rma.status))
  );

  protected readonly indicators = computed<DashboardIndicator[]>(() => {
    const rmas = this.rmasSignal();
    const activeRmas = this.activeRmas();
    const initialQueue = rmas.filter((rma) => rma.status === 'RECEIVED' || rma.status === 'TRIAGE');
    const rmaItems = rmas.flatMap((rma) => rma.items);
    const inWarrantyCount = rmaItems.filter((item) => item.warrantyStatus === WarrantyStatus.IN_WARRANTY).length;
    const pendingWarrantyCount = rmaItems.filter((item) => item.warrantyStatus === WarrantyStatus.PENDING).length;
    const warrantyRate = rmaItems.length === 0 ? 0 : Math.round((inWarrantyCount / rmaItems.length) * 100);
    const today = businessToday(Date.now());
    const deadlines = activeRmas.map((rma) => deadlineStatus(rma, today));
    const overdueCount = deadlines.filter((status) => status === 'OVERDUE').length;
    const dueSoonCount = deadlines.filter((status) => status === 'DUE_SOON').length;
    const catalog = [
      `${this.clientTotalSignal()} ${this.clientTotalSignal() === 1 ? 'cliente' : 'clientes'}`,
      `${this.productTotalSignal()} ${this.productTotalSignal() === 1 ? 'produto' : 'produtos'}`,
      ...(this.isAdmin() ? [`${this.userTotalSignal()} ${this.userTotalSignal() === 1 ? 'usuário' : 'usuários'}`] : [])
    ];

    return [
      {
        label: 'RMAs em andamento',
        value: String(activeRmas.length),
        detail: `de ${rmas.length} ${rmas.length === 1 ? 'registrado' : 'registrados'}`,
        icon: 'clipboard',
        tone: 'brand'
      },
      {
        label: 'Atrasados',
        value: String(overdueCount),
        detail: `· ${dueSoonCount} perto do limite`,
        icon: 'clock',
        tone: 'danger'
      },
      {
        label: 'Fila inicial (Recebido e Triagem)',
        value: String(initialQueue.length),
        detail: `· ${countHighPriority(initialQueue)} com prioridade alta`,
        icon: 'inbox',
        tone: 'sky'
      },
      {
        label: 'Itens em garantia',
        value: `${warrantyRate}%`,
        detail: `· ${inWarrantyCount} de ${rmaItems.length} ${rmaItems.length === 1 ? 'item' : 'itens'} · ${pendingWarrantyCount} ${pendingWarrantyCount === 1 ? 'pendente' : 'pendentes'}, em todos os RMAs registrados`,
        icon: 'shield',
        tone: 'success'
      },
      {
        label: 'Cadastros',
        value: catalog.join(' · '),
        detail: '',
        icon: 'layers',
        tone: 'violet',
        catalog: true
      }
    ];
  });

  protected readonly activeCount = computed(() => this.activeRmas().length);

  protected readonly queue = computed<QueueRow[]>(() =>
    [...this.activeRmas()]
      .sort(compareRmasForQueue)
      .slice(0, QUEUE_SIZE)
      .map((rma) => ({
        id: rma.id,
        code: rma.code,
        client: rma.clientName,
        entryDate: formatDateOnly(rma.entryDate),
        status: RMA_STATUS_LABELS[rma.status],
        statusCode: rma.status,
        priority: RMA_PRIORITY_LABELS[rma.priority],
        priorityCode: rma.priority
      }))
  );

  protected readonly auditEvents = computed<AuditRow[]>(() =>
    this.rmasSignal()
      .flatMap((rma) => rma.statusHistory.map((event) => ({ rma, event })))
      .sort((left, right) => compareDateStrings(right.event.changedAt, left.event.changedAt))
      .slice(0, 4)
      .map(({ rma, event }) => ({
        id: `${rma.code}-${event.changedAt}-${event.status}`,
        rmaId: rma.id,
        code: rma.code,
        statusCode: event.status,
        label: `Status registrado: ${RMA_STATUS_LABELS[event.status]}`,
        by: event.changedBy,
        note: event.note?.trim() || null,
        time: formatDateTime(event.changedAt)
      }))
  );

  protected readonly recentRmas = computed<RecentRmaRow[]>(() =>
    [...this.rmasSignal()]
      .sort((left, right) => compareDateStrings(right.updatedAt, left.updatedAt))
      .slice(0, 4)
      .map((rma) => ({
        id: rma.id,
        code: rma.code,
        client: rma.clientName,
        owner: extractOwner(rma),
        ownerInitials: initialsOf(rma.assigneeName),
        hasOwner: !!rma.assigneeName?.trim(),
        updatedAt: formatDateTime(rma.updatedAt)
      }))
  );

  constructor() {
    this.loadDashboard();
  }

  protected retryLoad(): void {
    if (this.loading()) return;
    this.loadDashboard();
  }

  private loadDashboard(): void {
    this.loadRequest?.unsubscribe();
    this.loading.set(true);

    const usersRequest = this.isAdmin()
      ? this.catalogService.getUserSummary()
      : of<UserSummaryResponse>({ total: 0, active: 0, admins: 0, roles: 0 });

    this.loadRequest = forkJoin({
      rmas: this.rmaService.listBoard(),
      clients: this.catalogService.getClientSummary(),
      products: this.catalogService.getProductSummary(),
      users: usersRequest
    }).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: ({ rmas, clients, products, users }) => {
        this.rmasSignal.set(rmas);
        this.clientTotalSignal.set(clients.total);
        this.productTotalSignal.set(products.total);
        this.userTotalSignal.set(users.total);
        this.hasLoaded.set(true);
        this.loadFailed.set(false);
        this.loadErrorMessage.set('');
      },
      error: () => {
        this.loadFailed.set(true);
        this.loadErrorMessage.set('Não foi possível carregar o dashboard.');
      }
    });
  }
}

function countHighPriority(rmas: RmaResponse[]): number {
  return rmas.filter((rma) => rma.priority === 'HIGH').length;
}

function compareDateStrings(left: string | null, right: string | null): number {
  return parseDateValue(left) - parseDateValue(right);
}

function parseDateValue(value: string | null): number {
  if (!value) {
    return 0;
  }

  return new Date(value).getTime();
}

function extractOwner(rma: RmaResponse): string {
  return rma.assigneeName?.trim() || 'Sem responsável';
}
