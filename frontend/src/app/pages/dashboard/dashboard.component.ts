import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { finalize, forkJoin, of } from 'rxjs';
import {
  CLOSED_RMA_STATUSES,
  MODULE_CARDS,
  RMA_PRIORITY_LABELS,
  RMA_STATUS_LABELS
} from '../../core/mock-data';
import {
  ClientResponse,
  MetricCard,
  ProductResponse,
  RmaPriority,
  RmaResponse,
  RmaStatusHistoryResponse,
  UserAccountResponse
} from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { CatalogService } from '../../core/services/catalog.service';
import { RmaService } from '../../core/services/rma.service';

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
  imports: [RouterLink],
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
  private readonly clientsSignal = signal<ClientResponse[]>([]);
  private readonly productsSignal = signal<ProductResponse[]>([]);
  private readonly usersSignal = signal<UserAccountResponse[]>([]);

  protected readonly metrics = computed<MetricCard[]>(() => {
    const rmas = this.rmasSignal();
    const clients = this.clientsSignal();
    const products = this.productsSignal();
    const users = this.usersSignal();

    const activeRmas = rmas.filter((rma) => !CLOSED_RMA_STATUSES.includes(rma.status));
    const initialQueue = rmas.filter((rma) => rma.status === 'RECEIVED' || rma.status === 'TRIAGE');
    const inWarrantyCount = rmas.filter((rma) => rma.warrantyStatus === 'IN_WARRANTY').length;
    const pendingWarrantyCount = rmas.filter((rma) => rma.warrantyStatus === 'PENDING').length;
    const warrantyRate = rmas.length === 0 ? 0 : Math.round((inWarrantyCount / rmas.length) * 100);
    const catalogTotal = clients.length + products.length + users.length;

    return [
      {
        label: 'RMAs ativos',
        value: String(activeRmas.length),
        variation: `${rmas.length} registros`,
        tone: 'brand'
      },
      {
        label: 'Garantia',
        value: `${warrantyRate}%`,
        variation: pendingWarrantyCount > 0 ? `${pendingWarrantyCount} pendentes` : 'Sem pendências',
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
        variation: `${clients.length} clientes | ${products.length} produtos${users.length > 0 ? ` | ${users.length} usuários` : ''}`,
        tone: 'light'
      }
    ];
  });

  protected readonly modules = computed(() =>
    MODULE_CARDS.filter((module) => this.authService.hasAnyRole(module.roles))
  );

  protected readonly queue = computed<QueueRow[]>(() =>
    [...this.rmasSignal()]
      .sort(compareRmasForQueue)
      .slice(0, 5)
      .map((rma) => ({
        code: rma.code,
        client: rma.clientName,
        entryDate: formatDate(rma.entryDate),
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

  protected refresh(): void {
    this.loadDashboard();
  }

  private loadDashboard(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    const usersRequest = this.authService.hasAnyRole(['ADMIN'])
      ? this.catalogService.listUsers()
      : of<UserAccountResponse[]>([]);

    forkJoin({
      rmas: this.rmaService.list(),
      clients: this.catalogService.listClients(),
      products: this.catalogService.listProducts(),
      users: usersRequest
    }).pipe(
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: ({ rmas, clients, products, users }) => {
        this.rmasSignal.set(rmas);
        this.clientsSignal.set(clients);
        this.productsSignal.set(products);
        this.usersSignal.set(users);
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
  if (rma.diagnosis?.technicianName?.trim()) {
    return rma.diagnosis.technicianName.trim();
  }

  const lastStatusUpdate = latestStatusUpdate(rma.statusHistory);
  if (lastStatusUpdate?.changedBy?.trim()) {
    return lastStatusUpdate.changedBy.trim();
  }

  return rma.receivedBy;
}

function latestStatusUpdate(history: RmaStatusHistoryResponse[]): RmaStatusHistoryResponse | null {
  if (history.length === 0) {
    return null;
  }

  return [...history].sort((left, right) => compareDateStrings(right.changedAt, left.changedAt))[0] ?? null;
}

function formatDate(value: string | null): string {
  if (!value) {
    return 'Não informado';
  }

  return new Intl.DateTimeFormat('pt-BR').format(new Date(value));
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
