import { Component, computed, inject, signal } from '@angular/core';
import { finalize, forkJoin, of } from 'rxjs';
import {
  CLOSED_RMA_STATUSES,
  RMA_PRIORITY_LABELS,
  RMA_STATUS_LABELS
} from '../../core/mock-data';
import {
  MetricCard,
  RmaPriority,
  RmaResponse,
  RmaStatusHistoryResponse,
  UserSummaryResponse,
  WarrantyStatus
} from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { CatalogService } from '../../core/services/catalog.service';
import { RmaService } from '../../core/services/rma.service';
import { formatDateOnly } from '../../core/utils/date';

interface QueueRow {
  code: string;
  client: string;
  entryDate: string;
  status: string;
  priority: string;
}

interface AuditRow {
  id: string;
  action: string;
  detail: string;
  time: string;
}

interface RecentRmaRow {
  code: string;
  client: string;
  owner: string;
  updatedAt: string;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styles: [':host { display: block; }']
})
export class DashboardComponent {
  private readonly authService = inject(AuthService);
  private readonly catalogService = inject(CatalogService);
  private readonly rmaService = inject(RmaService);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal('');

  private readonly rmasSignal = signal<RmaResponse[]>([]);
  private readonly clientTotalSignal = signal(0);
  private readonly productTotalSignal = signal(0);
  private readonly userTotalSignal = signal(0);

  protected readonly metrics = computed<MetricCard[]>(() => {
    const rmas = this.rmasSignal();
    const clients = this.clientTotalSignal();
    const products = this.productTotalSignal();
    const users = this.userTotalSignal();

    const activeRmas = rmas.filter((rma) => !CLOSED_RMA_STATUSES.includes(rma.status));
    const initialQueue = rmas.filter((rma) => rma.status === 'RECEIVED' || rma.status === 'TRIAGE');
    const rmaItems = rmas.flatMap((rma) => rma.items);
    const inWarrantyCount = rmaItems.filter((item) => item.warrantyStatus === WarrantyStatus.IN_WARRANTY).length;
    const pendingWarrantyCount = rmaItems.filter((item) => item.warrantyStatus === WarrantyStatus.PENDING).length;
    const warrantyRate = rmaItems.length === 0 ? 0 : Math.round((inWarrantyCount / rmaItems.length) * 100);
    const catalogTotal = clients + products + users;

    return [
      {
        label: 'RMAs ativos',
        value: String(activeRmas.length),
        variation: `${rmas.length} registros`,
        tone: 'brand'
      },
      {
        label: 'Produtos em garantia',
        value: `${warrantyRate}%`,
        variation: `${inWarrantyCount} de ${rmaItems.length} itens | ${pendingWarrantyCount} pendentes`,
        tone: 'sky'
      },
      {
        label: 'Fila inicial',
        value: String(initialQueue.length),
        variation: `${countHighPriority(initialQueue)} alta`,
        tone: 'slate'
      },
      {
        label: 'Cadastros',
        value: String(catalogTotal),
        variation: `${clients} clientes | ${products} produtos${users > 0 ? ` | ${users} usuários` : ''}`,
        tone: 'light'
      }
    ];
  });

  protected readonly queue = computed<QueueRow[]>(() =>
    [...this.rmasSignal()]
      .sort(compareRmasForQueue)
      .slice(0, 5)
      .map((rma) => ({
        code: rma.code,
        client: rma.clientName,
        entryDate: formatDateOnly(rma.entryDate),
        status: RMA_STATUS_LABELS[rma.status],
        priority: RMA_PRIORITY_LABELS[rma.priority]
      }))
  );

  protected readonly auditEvents = computed<AuditRow[]>(() =>
    this.rmasSignal()
      .flatMap((rma) =>
        rma.statusHistory.map((event) => ({
          rmaCode: rma.code,
          event
        }))
      )
      .sort((left, right) => compareDateStrings(right.event.changedAt, left.event.changedAt))
      .slice(0, 4)
      .map(({ rmaCode, event }) => ({
        id: `${rmaCode}-${event.changedAt}-${event.status}`,
        action: `${rmaCode} · ${RMA_STATUS_LABELS[event.status]}`,
        detail: event.note?.trim() || event.changedBy,
        time: formatDateTime(event.changedAt)
      }))
  );

  protected readonly recentRmas = computed<RecentRmaRow[]>(() =>
    [...this.rmasSignal()]
      .sort((left, right) => compareDateStrings(right.updatedAt, left.updatedAt))
      .slice(0, 4)
      .map((rma) => ({
        code: rma.code,
        client: rma.clientName,
        owner: extractOwner(rma),
        updatedAt: formatDateTime(rma.updatedAt)
      }))
  );

  constructor() {
    this.loadDashboard();
  }

  private loadDashboard(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    const usersRequest = this.authService.hasAnyRole(['ADMIN'])
      ? this.catalogService.getUserSummary()
      : of<UserSummaryResponse>({ total: 0, active: 0, admins: 0, roles: 0 });

    forkJoin({
      rmas: this.rmaService.listBoard(),
      clients: this.catalogService.getClientSummary(),
      products: this.catalogService.getProductSummary(),
      users: usersRequest
    }).pipe(
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: ({ rmas, clients, products, users }) => {
        this.rmasSignal.set(rmas);
        this.clientTotalSignal.set(clients.total);
        this.productTotalSignal.set(products.total);
        this.userTotalSignal.set(users.total);
      },
      error: () => {
        this.errorMessage.set('Não foi possível carregar o dashboard.');
      }
    });
  }
}

function countHighPriority(rmas: RmaResponse[]): number {
  return rmas.filter((rma) => rma.priority === 'HIGH').length;
}

function compareRmasForQueue(left: RmaResponse, right: RmaResponse): number {
  const priorityDiff = priorityWeight(right.priority) - priorityWeight(left.priority);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  return compareDateStrings(left.entryDate, right.entryDate);
}

function priorityWeight(priority: RmaPriority): number {
  switch (priority) {
    case 'HIGH':
      return 3;
    case 'MEDIUM':
      return 2;
    default:
      return 1;
  }
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

function latestStatusUpdate(history: RmaStatusHistoryResponse[]): RmaStatusHistoryResponse | null {
  if (history.length === 0) {
    return null;
  }

  return [...history].sort((left, right) => compareDateStrings(right.changedAt, left.changedAt))[0] ?? null;
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return 'Não informado';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}
