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
  RmaDashboardResponse,
  RmaPriority,
  RmaStatus,
  UserSummaryResponse
} from '../../core/models';
import { PermissionService } from '../../core/services/permission.service';
import { CatalogService } from '../../core/services/catalog.service';
import { RmaService } from '../../core/services/rma.service';
import { IconComponent, IconName } from '../../shared/icon/icon.component';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { initialsOf } from '../../core/utils/rma-ui';
import { formatBusinessDateTime as formatDateTime, formatDateOnly } from '../../core/utils/date';

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

  private readonly dashboardSignal = signal<RmaDashboardResponse>(EMPTY_DASHBOARD);
  private readonly clientTotalSignal = signal(0);
  private readonly productTotalSignal = signal(0);
  private readonly userTotalSignal = signal(0);

  private readonly totalCount = computed(() =>
    Object.values(this.dashboardSignal().statusCounts).reduce((sum, count) => sum + (count ?? 0), 0)
  );

  protected readonly activeCount = computed(() => {
    const counts = this.dashboardSignal().statusCounts;
    return this.totalCount() - CLOSED_RMA_STATUSES.reduce((sum, status) => sum + (counts[status] ?? 0), 0);
  });

  protected readonly indicators = computed<DashboardIndicator[]>(() => {
    const dashboard = this.dashboardSignal();
    const total = this.totalCount();
    const active = this.activeCount();
    const initialQueue = (dashboard.statusCounts.RECEIVED ?? 0) + (dashboard.statusCounts.TRIAGE ?? 0);
    const items = dashboard.items;
    const warrantyRate = items === 0 ? 0 : Math.round((dashboard.itemsInWarranty / items) * 100);
    const pending = dashboard.itemsPendingWarranty;
    const catalog = [
      `${this.clientTotalSignal()} ${this.clientTotalSignal() === 1 ? 'cliente' : 'clientes'}`,
      `${this.productTotalSignal()} ${this.productTotalSignal() === 1 ? 'produto' : 'produtos'}`,
      ...(this.isAdmin() ? [`${this.userTotalSignal()} ${this.userTotalSignal() === 1 ? 'usuário' : 'usuários'}`] : [])
    ];

    return [
      {
        label: 'Ordens de serviço em andamento',
        value: String(active),
        detail: `de ${total} ${total === 1 ? 'registrada' : 'registradas'}`,
        icon: 'clipboard',
        tone: 'brand'
      },
      {
        label: 'Atrasadas',
        value: String(dashboard.overdue),
        detail: `· ${dashboard.dueSoon} perto do limite`,
        icon: 'clock',
        tone: 'danger'
      },
      {
        label: 'Fila inicial (Recebida e Triagem)',
        value: String(initialQueue),
        detail: `· ${dashboard.initialQueueHighPriority} com prioridade alta`,
        icon: 'inbox',
        tone: 'sky'
      },
      {
        label: 'Itens em garantia',
        value: `${warrantyRate}%`,
        detail: `· ${dashboard.itemsInWarranty} de ${items} ${items === 1 ? 'item' : 'itens'} · ${pending} ${pending === 1 ? 'pendente' : 'pendentes'}, em todas as ordens de serviço registradas`,
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

  protected readonly queue = computed<QueueRow[]>(() =>
    this.dashboardSignal().queue.map((rma) => ({
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
    this.dashboardSignal().statusEvents.map((event) => ({
      id: `${event.code}-${event.changedAt}-${event.status}`,
      rmaId: event.rmaId,
      code: event.code,
      statusCode: event.status,
      label: `Status registrado: ${RMA_STATUS_LABELS[event.status]}`,
      by: event.changedBy,
      note: event.note?.trim() || null,
      time: formatDateTime(event.changedAt)
    }))
  );

  protected readonly recentRmas = computed<RecentRmaRow[]>(() =>
    this.dashboardSignal().recent.map((rma) => ({
      id: rma.id,
      code: rma.code,
      client: rma.clientName,
      owner: rma.assigneeName?.trim() || 'Sem responsável',
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
      : of<UserSummaryResponse>({ total: 0 });

    this.loadRequest = forkJoin({
      dashboard: this.rmaService.getDashboard(),
      clients: this.catalogService.getClientSummary(),
      products: this.catalogService.getProductSummary(),
      users: usersRequest
    }).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: ({ dashboard, clients, products, users }) => {
        this.dashboardSignal.set(dashboard);
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

const EMPTY_DASHBOARD: RmaDashboardResponse = {
  statusCounts: {}, initialQueueHighPriority: 0, overdue: 0, dueSoon: 0,
  items: 0, itemsInWarranty: 0, itemsPendingWarranty: 0, queue: [], recent: [], statusEvents: []
};
