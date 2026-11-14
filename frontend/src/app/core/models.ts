import type { IconName } from '../shared/icon/icon.component';
import type { Permission } from './permissions';

export type RmaPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export enum WarrantyStatus {
  PENDING = 'PENDING',
  IN_WARRANTY = 'IN_WARRANTY',
  OUT_OF_WARRANTY = 'OUT_OF_WARRANTY',
}

export type RmaStatus =
  | 'RECEIVED'
  | 'TRIAGE'
  | 'IN_DIAGNOSIS'
  | 'WAITING_PART'
  | 'IN_REPAIR'
  | 'IN_TESTS'
  | 'COMPLETED'
  | 'RETURNED'
  | 'IRREPARABLE';

export type FailureType =
  | 'POWER_SUPPLY'
  | 'PWM'
  | 'SENSOR'
  | 'COMMUNICATION'
  | 'DISPLAY'
  | 'FIRMWARE'
  | 'MECHANICAL'
  | 'OTHER';

export type FailureCause =
  | 'COMPONENT'
  | 'SOLDER'
  | 'HUMIDITY'
  | 'OVERLOAD'
  | 'ESD'
  | 'INCORRECT_USAGE'
  | 'OTHER';

export interface UserSession {
  username: string;
  name: string;
  profileName: string;
  permissions: Permission[];
  email?: string | null;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface UserAccountResponse {
  id: number;
  username: string;
  fullName: string;
  profile: ProfileRef;
  /** Extras do usuário, na ordem do catálogo; podem repetir permissões do perfil. */
  extraPermissions: string[];
  active: boolean;
  updatedAt: string;
  email?: string | null;
}

export interface AssignableUserResponse {
  id: number;
  username: string;
  fullName: string;
}

export interface ProfileRef {
  id: number;
  name: string;
}

/** `GET /api/profiles`: permissões na ordem do catálogo. */
export interface ProfileResponse {
  id: number;
  name: string;
  permissions: string[];
  userCount: number;
  updatedAt: string;
}

export interface ProfileOption {
  id: number;
  name: string;
  permissions: string[];
}

export interface ProfileRequest {
  name: string;
  permissions: Permission[];
}

export interface PermissionItem {
  code: string;
  label: string;
}

/** `GET /api/permissions`: os módulos do catálogo, na ordem de exibição. */
export interface PermissionModuleResponse {
  module: string;
  label: string;
  permissions: PermissionItem[];
}

/** Sessão (`POST /api/auth/login` e `GET /api/auth/me`), com as permissões efetivas na ordem do catálogo. */
export interface SessionResponse {
  username: string;
  fullName: string;
  email?: string | null;
  profileName: string | null;
  permissions: string[];
}

export type AuthUserResponse = SessionResponse;

export interface UserAccountRequest {
  username: string;
  fullName: string;
  password: string;
  profileId: number;
  extraPermissions: Permission[];
  active: boolean;
  email?: string | null;
}

export interface UserAccountUpdateRequest {
  username: string;
  fullName: string;
  password: string | null;
  profileId: number;
  extraPermissions: Permission[];
  active: boolean;
  email?: string | null;
}

export interface ClientResponse {
  id: number;
  legalName: string;
  tradeName: string | null;
  documentNumber: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  updatedAt: string;
}

/** Linha da lista de clientes; endereço e observações ficam no detalhe (`GET /api/clients/{id}`). */
export interface ClientListItemResponse {
  id: number;
  legalName: string;
  tradeName: string | null;
  documentNumber: string | null;
  email: string | null;
  phone: string | null;
  updatedAt: string;
}

export interface ClientRequest {
  legalName: string;
  tradeName: string | null;
  documentNumber: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
}

export interface ProductResponse {
  id: number;
  sku: string;
  name: string;
  category: string | null;
  hardwareVersion: string | null;
  firmwareVersion: string | null;
  defaultWarrantyMonths: number;
  technicalNotes: string | null;
  updatedAt: string;
}

export interface ProductRequest {
  sku: string;
  name: string;
  category: string | null;
  hardwareVersion: string | null;
  firmwareVersion: string | null;
  defaultWarrantyMonths: number;
  technicalNotes: string | null;
}

export interface DiagnosisResponse {
  foundFailure: string | null;
  failureType: FailureType | null;
  probableCause: FailureCause | null;
  notes: string | null;
  diagnosedAt: string | null;
  technicianName: string | null;
}

export interface RmaItemRequest {
  productId: number;
  batchNumber: string | null;
  serialNumber: string | null;
  manufacturedAt: string | null;
}

export interface CreateRmaRequest {
  clientId: number;
  items: RmaItemRequest[];
  purchaseDate: string | null;
  purchaseDateUnknown: boolean;
  entryDate: string;
  invoiceNumber: string | null;
  reportedFailure: string;
  receivedAccessories: string | null;
  physicalCondition: string | null;
  priority: RmaPriority;
  repairSummary: string | null;
  replacedPartsSummary: string | null;
  testSummary: string | null;
  /** Optional due date of the whole service (YYYY-MM-DD). */
  dueDate?: string | null;
}

export interface RmaStatusUpdateRequest {
  status: RmaStatus;
  note: string | null;
}

export interface RmaAssigneeUpdateRequest {
  assigneeId: number | null;
}

export interface KanbanViewFilters {
  blocked?: boolean | null;
  query: string | null;
  priority: RmaPriority | null;
  status: RmaStatus | null;
  warranty: WarrantyStatus | null;
  assigneeId: number | null;
  unassignedOnly: boolean;
  entryFrom: string | null;
  entryTo: string | null;
  updatedFrom: string | null;
  updatedTo: string | null;
  /** Saved "Prazo" filter; null (or absent in older views) means "Todos". */
  deadline?: 'OVERDUE' | 'DUE_SOON' | 'ON_TRACK' | 'NO_DUE_DATE' | null;
}

export interface KanbanViewRequest {
  name: string;
  defaultView: boolean;
  filters: KanbanViewFilters;
}

export interface KanbanViewResponse extends KanbanViewRequest {
  id: number;
}

export interface DiagnosisRequest {
  foundFailure: string;
  failureType: FailureType | null;
  probableCause: FailureCause | null;
  notes: string | null;
  diagnosedAt: string;
  technicianName: string;
}

export interface RmaStatusHistoryResponse {
  id?: number;
  noteEditedBy?: string | null;
  noteEditedAt?: string | null;
  status: RmaStatus;
  changedBy: string;
  changedAt: string;
  note: string | null;
}

export interface RmaAssignmentHistoryResponse {
  previousAssigneeName: string | null;
  newAssigneeName: string | null;
  changedBy: string;
  changedAt: string;
}

export interface RmaBlockRequest {
  reason: string;
  category: string | null;
}

export interface RmaBlockResolveRequest {
  resolutionNote: string;
}

export interface RmaBlockResponse {
  id: number;
  reason: string;
  category: string | null;
  blockedBy: string;
  blockedAt: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

export type WarrantyOverrideStatus = WarrantyStatus.IN_WARRANTY | WarrantyStatus.OUT_OF_WARRANTY;

export interface RmaItemWarrantyRequest {
  override: WarrantyOverrideStatus | null;
  reason: string | null;
}

export interface WarrantyOverrideResponse {
  status: WarrantyOverrideStatus;
  reason: string;
  changedBy: string;
  changedAt: string;
}

export interface RmaItemWarrantyHistoryResponse {
  itemId: number;
  previousOverride: WarrantyOverrideStatus | null;
  newOverride: WarrantyOverrideStatus | null;
  reason: string | null;
  changedBy: string;
  changedAt: string;
}

export interface RmaItemResponse {
  id: number | null;
  productName: string;
  productSku: string;
  batchNumber: string | null;
  serialNumber: string | null;
  manufacturedAt: string | null;
  warrantyMonths: number;
  warrantyExpiresAt: string | null;
  warrantyStatus: WarrantyStatus;
  calculatedWarrantyStatus: WarrantyStatus;
  warrantyOverride: WarrantyOverrideResponse | null;
}

export type RmaDeadlineStatus = 'OVERDUE' | 'DUE_SOON' | 'ON_TRACK' | 'NO_DUE_DATE' | 'CLOSED';

export interface RmaDeadlineResponse {
  status: RmaDeadlineStatus;
  dueSoonFrom: string | null;
}

/** One continuous stay in a stage; `leftAt` is null for the current stage. */
export interface RmaStagePeriodResponse {
  status: RmaStatus;
  enteredAt: string;
  leftAt: string | null;
  durationSeconds: number;
}

export interface RmaDueDateHistoryResponse {
  previousDueDate: string | null;
  newDueDate: string | null;
  changedBy: string;
  changedAt: string;
}

export type UpdateRmaDueDateRequest = { dueDate: string } | { clearDueDate: true };

/** `GET /api/rmas/dashboard`: indicadores calculados no servidor, sem históricos. */
export interface RmaDashboardResponse {
  statusCounts: Partial<Record<RmaStatus, number>>;
  initialQueueHighPriority: number;
  /** OS abertas com prazo vencido e perto do limite. */
  overdue: number;
  dueSoon: number;
  /** Itens de todas as OS registradas. */
  items: number;
  itemsInWarranty: number;
  itemsPendingWarranty: number;
  /** Até cinco OS abertas, por prioridade e entrada mais antiga. */
  queue: RmaDashboardQueueItem[];
  /** As quatro OS atualizadas por último, encerradas incluídas. */
  recent: RmaDashboardRecentItem[];
  /** Os quatro eventos de status mais recentes. */
  statusEvents: RmaDashboardStatusEvent[];
}

export interface RmaDashboardQueueItem {
  id: number;
  code: string;
  clientName: string;
  entryDate: string;
  status: RmaStatus;
  priority: RmaPriority;
}

export interface RmaDashboardRecentItem {
  id: number;
  code: string;
  clientName: string;
  assigneeName: string | null;
  updatedAt: string;
}

export interface RmaDashboardStatusEvent {
  rmaId: number;
  code: string;
  status: RmaStatus;
  changedBy: string;
  note: string | null;
  changedAt: string;
}

export interface RmaResponse {
  id: number;
  code: string;
  clientName: string;
  items: RmaItemResponse[];
  purchaseDate: string | null;
  purchaseDateUnknown: boolean;
  entryDate: string;
  dueDate: string | null;
  invoiceNumber: string | null;
  receivedBy: string;
  reportedFailure: string;
  receivedAccessories: string | null;
  physicalCondition: string | null;
  priority: RmaPriority;
  status: RmaStatus;
  deadline: RmaDeadlineResponse;
  assigneeId: number | null;
  assigneeName: string | null;
  repairSummary: string | null;
  replacedPartsSummary: string | null;
  testSummary: string | null;
  carrier: string | null;
  trackingCode: string | null;
  diagnosis: DiagnosisResponse | null;
  repairHistory?: RmaRepairHistoryResponse[];
  statusHistory: RmaStatusHistoryResponse[];
  stagePeriods: RmaStagePeriodResponse[];
  assignmentHistory: RmaAssignmentHistoryResponse[];
  dueDateHistory: RmaDueDateHistoryResponse[];
  warrantyHistory: RmaItemWarrantyHistoryResponse[];
  currentBlock: RmaBlockResponse | null;
  blockHistory: RmaBlockResponse[];
  createdAt: string;
  updatedAt: string;
}

/** Detalhe completo da OS: `GET /api/rmas/{id}` e as respostas de todas as escritas. */
export type RmaDetailResponse = RmaResponse;

/** Item resumido da OS nas coleções: rótulos, garantia por produto e busca. */
export interface RmaItemSummaryResponse {
  id: number | null;
  productName: string;
  productSku: string;
  batchNumber: string | null;
  serialNumber: string | null;
  warrantyStatus: WarrantyStatus;
}

/** Impedimento ativo resumido no card do Kanban. */
export interface RmaBlockSummaryResponse {
  reason: string;
  blockedAt: string;
}

/** Linha da lista paginada de OS (`GET /api/rmas`). */
export interface RmaListItemResponse {
  id: number;
  code: string;
  clientName: string;
  items: RmaItemSummaryResponse[];
  status: RmaStatus;
  priority: RmaPriority;
  entryDate: string;
}

/** Card do Kanban (`GET /api/rmas/board`): o que o card, os filtros e a busca usam, sem históricos nem textos livres. */
export interface RmaBoardCardResponse {
  id: number;
  code: string;
  clientName: string;
  items: RmaItemSummaryResponse[];
  status: RmaStatus;
  priority: RmaPriority;
  entryDate: string;
  dueDate: string | null;
  deadline: RmaDeadlineResponse;
  updatedAt: string;
  assigneeId: number | null;
  assigneeName: string | null;
  currentBlock: RmaBlockSummaryResponse | null;
  stagePeriods: RmaStagePeriodResponse[];
}

export type NotificationEventType =
  | 'RMA_CREATED'
  | 'RMA_ASSIGNED'
  | 'RMA_BLOCKED'
  | 'PART_PENDING'
  | 'TEST_FAILED';

export type NotificationSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface NotificationResponse {
  id: number;
  eventType: NotificationEventType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  rmaId: number | null;
  rmaCode: string | null;
  rmaPriority?: RmaPriority | null;
  actionPath: string | null;
  createdAt: string;
  readAt: string | null;
  snoozedUntil: string | null;
  read: boolean;
}

export interface NotificationSummaryResponse {
  unread: number;
}

export interface NotificationReadAllResponse {
  markedCount: number;
  undoToken: string | null;
  expiresAt: string | null;
}

export interface NotificationReadUndoResponse {
  restoredCount: number;
}

export interface NotificationPreferenceResponse {
  eventType: NotificationEventType;
  severity: NotificationSeverity;
  enabled: boolean;
  userMutable: boolean;
  muted: boolean;
}

export interface NotificationRuleRequest {
  appEnabled?: boolean;
  enabled: boolean;
  severity: NotificationSeverity;
  recipientProfileIds: number[];
  notifyAssignee: boolean;
  emailEnabled: boolean;
  userMutable: boolean;
}

export interface NotificationRuleResponse extends Omit<NotificationRuleRequest, 'recipientProfileIds'> {
  supported?: boolean;
  /** Ordenados por nome. */
  recipientProfiles: ProfileRef[];
  eventType: NotificationEventType;
  updatedAt: string;
  updatedBy: string | null;
}

export interface NotificationFailureResponse {
  source: 'EVENT' | 'EMAIL';
  eventKey: string;
  eventType: NotificationEventType;
  rmaCode: string | null;
  recipient: string | null;
  error: string | null;
  occurredAt: string;
  notificationId?: number | null;
  attempts?: number;
  provider?: string | null;
  status?: NotificationEmailStatus | null;
  nextAttemptAt?: string | null;
  retryAllowed?: boolean;
}

export type PartMovementType =
  | 'ENTRY'
  | 'EXIT'
  | 'ADJUSTMENT'
  | 'RESERVATION'
  | 'RESERVATION_CANCEL'
  | 'CONSUMPTION'
  | 'REVERSAL';

export type ManualPartMovementType = Extract<PartMovementType, 'ENTRY' | 'EXIT' | 'ADJUSTMENT'>;

export type PartReservationStatus = 'PENDING' | 'ACTIVE' | 'CONSUMED' | 'CANCELLED' | 'REVERSED';

export interface PartRequest {
  code: string;
  name: string;
  unit: string;
  location: string | null;
  minimumStock: number;
  unitCost: number;
  active: boolean;
}

export interface PartResponse {
  id: number;
  code: string;
  name: string;
  unit: string;
  location: string | null;
  minimumStock: number;
  unitCost: number;
  onHand: number;
  reserved: number;
  available: number;
  belowMinimum: boolean;
  active: boolean;
}

export interface PartMovementRequest {
  type: ManualPartMovementType;
  quantity: number;
  reason: string | null;
}

export interface PartMovementResponse {
  id: number;
  partId: number;
  partCode: string;
  partName: string;
  type: PartMovementType;
  quantity: number;
  onHandChange: number;
  reservedChange: number;
  onHandAfter: number;
  reservedAfter: number;
  rmaCode: string | null;
  reversedMovementId: number | null;
  reversed: boolean;
  reason: string | null;
  createdBy: string;
  createdAt: string;
}

export interface PartReservationRequest {
  partId: number;
  quantity: number;
  note: string | null;
}

export interface PartReservationResponse {
  id: number;
  rmaId: number;
  rmaCode: string;
  partId: number;
  partCode: string;
  partName: string;
  unit: string;
  location: string | null;
  quantity: number;
  status: PartReservationStatus;
  partAvailable: number;
  /** Nulos para quem não tem `pecas.ver`. */
  unitCost: number | null;
  totalCost: number | null;
  note: string | null;
  replacementReason?: string | null;
  componentBatch?: string | null;
  appliedAt?: string | null;
  appliedBy?: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RmaPartsResponse {
  rmaId: number;
  rmaCode: string;
  reservations: PartReservationResponse[];
  replacedComponents?: PartReservationResponse[];
  movements: PartMovementResponse[];
  /** Nulos para quem não tem `pecas.ver`. */
  reservedCost: number | null;
  consumedCost: number | null;
  pendingCount: number;
}

export interface PartConsumptionRequest {
  replacementReason: string;
  componentBatch: string | null;
}

export interface ExternalComponentRequest extends PartConsumptionRequest {
  code: string | null;
  description: string;
  quantity: number;
  unit: string;
}

export interface RepairAudit {
  editedBy?: string | null;
  editedAt?: string | null;
  voidedBy?: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;
}

export interface RmaRepairHistoryResponse {
  id: number;
  entityType: 'EXTERNAL_COMPONENT' | 'INTERVENTION' | 'STOCK_COMPONENT';
  entityId: number;
  action: 'CREATE' | 'UPDATE' | 'VOID' | 'APPLY';
  changedBy: string;
  changedAt: string;
  summary: string;
}

export interface ExternalComponentResponse extends ExternalComponentRequest, RepairAudit {
  id: number;
  appliedAt: string;
  appliedBy: string;
}

export type InterventionType = 'RESOLDERING' | 'CLEANING' | 'REPROGRAMMING' | 'FIRMWARE_UPDATE' | 'HARNESS_REPLACEMENT' | 'OTHER';

export interface InterventionRequest {
  type: InterventionType;
  description: string;
  performedOn: string;
  hours: number;
}

export interface InterventionResponse extends InterventionRequest, RepairAudit {
  id: number;
  technicianName: string;
}

export interface RmaRepairResponse {
  interventions: InterventionResponse[];
  totalServiceHours: number;
}

export interface PartReplenishmentResponse {
  partId: number;
  code: string;
  name: string;
  unit: string;
  location: string | null;
  minimumStock: number;
  onHand: number;
  reserved: number;
  available: number;
  pendingQuantity: number;
  suggestedQuantity: number;
  belowMinimum: boolean;
}

export interface RmaReportFilters {
  entryFrom?: string;
  entryTo?: string;
  status?: RmaStatus;
  clientId?: number;
}

export interface RmaReportRow {
  id: number;
  code: string;
  entryDate: string;
  status: RmaStatus;
  clientName: string;
  productName: string;
  productSku: string;
  serialNumber: string | null;
  batchNumber: string | null;
  itemCount: number;
  warrantyStatuses: WarrantyStatus[];
  failureType: FailureType | null;
}

export interface RmaReportPageResponse {
  generatedAt: string;
  entryFrom: string;
  entryTo: string;
  rmas: PageResponse<RmaReportRow>;
}

export interface RmaReportCountRow {
  key: string;
  label: string;
  count: number;
}

export interface RmaReportRateRow {
  key: string;
  label: string;
  items: number;
  returnedItems: number;
}

export interface RmaReportSummaryResponse {
  generatedAt: string;
  entryFrom: string;
  entryTo: string;
  totalRmas: number;
  totalItems: number;
  byStatus: RmaReportCountRow[];
  byWarranty: RmaReportCountRow[];
  byMonth: RmaReportCountRow[];
  topProducts: RmaReportCountRow[];
  topBatches: RmaReportCountRow[];
  topClients: RmaReportCountRow[];
  topFailureTypes: RmaReportCountRow[];
  recurrence: {
    itemsWithSerial: number;
    returnedItems: number;
    byProduct: RmaReportRateRow[];
    byBatch: RmaReportRateRow[];
    serials: { serialNumber: string; productName: string; productSku: string; rmaCount: number }[];
  };
  stages: { status: RmaStatus; label: string; count: number; averageSeconds: number; maximumSeconds: number }[];
}


export interface NavItem {
  label: string;
  route: string;
  icon: IconName;
  /** Todas exigidas; vazio = só login. */
  permissions: Permission[];
  alternativePermissions?: Permission[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export interface PageQuery {
  page?: number;
  size?: number;
}

export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface RmaSummaryResponse {
  total: number;
  ongoing: number;
  highPriority: number;
}

export interface ClientSummaryResponse {
  total: number;
}

export interface ProductSummaryResponse {
  total: number;
  categories: string[];
}

export interface UserSummaryResponse {
  total: number;
}

export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export type ProtocolItemType = 'CHECK' | 'MEASUREMENT' | 'TEXT';

export type ProtocolItemOutcome = 'PASSED' | 'FAILED' | 'NOT_APPLICABLE';

export type ProtocolExecutionStatus = 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export interface ProtocolTemplateItemRequest {
  stepName: string;
  title: string;
  instructions: string | null;
  type: ProtocolItemType;
  required: boolean;
  unit: string | null;
  decimalPlaces: number | null;
  minValue: string | null;
  maxValue: string | null;
  expectedResult: string | null;
  evidenceRequired: boolean;
}

export interface ProtocolTemplateRequest {
  name: string;
  productId: number | null;
  category: string | null;
  active: boolean;
  blockedStatuses: RmaStatus[];
  items: ProtocolTemplateItemRequest[];
}

export interface ProtocolTemplateItemResponse {
  id: number;
  sortOrder: number;
  stepName: string;
  title: string;
  instructions: string | null;
  type: ProtocolItemType;
  required: boolean;
  unit: string | null;
  decimalPlaces: number | null;
  minValue: number | null;
  maxValue: number | null;
  expectedResult: string | null;
  evidenceRequired: boolean;
}

export interface ProtocolTemplateResponse {
  id: number;
  name: string;
  productId: number | null;
  productName: string | null;
  category: string | null;
  active: boolean;
  currentVersion: number;
  blockedStatuses: RmaStatus[];
  items: ProtocolTemplateItemResponse[];
  updatedAt: string;
}

export interface ProtocolItemResultRequest {
  outcome: ProtocolItemOutcome;
  measuredValue: string | null;
  textValue: string | null;
  evidence: string | null;
  justification: string | null;
  startedAt: string | null;
}

export interface ProtocolItemResultResponse {
  id: number;
  attempt: number;
  outcome: ProtocolItemOutcome;
  measuredValue: string | null;
  unit: string | null;
  textValue: string | null;
  evidence: string | null;
  justification: string | null;
  executedBy: string;
  startedAt: string;
  completedAt: string;
}

export interface ProtocolExecutionItemResponse {
  item: ProtocolTemplateItemResponse;
  latest: ProtocolItemResultResponse | null;
  attempts: ProtocolItemResultResponse[];
}

export interface ProtocolExecutionResponse {
  id: number;
  rmaId: number;
  rmaCode: string;
  templateId: number;
  templateName: string;
  versionNumber: number;
  status: ProtocolExecutionStatus;
  blockedStatuses: RmaStatus[];
  startedBy: string;
  startedAt: string;
  completedBy: string | null;
  completedAt: string | null;
  totalItems: number;
  completedItems: number;
  requiredItems: number;
  pendingRequiredItems: number;
  failedItems: number;
  items: ProtocolExecutionItemResponse[];
}

export type NotificationEmailStatus = 'NOT_REQUESTED' | 'PENDING' | 'SENT' | 'FAILED';
export interface NotificationEmailStatusResponse {
  enabled: boolean; provider: string;
  sentToday?: number; dailyLimit?: number; sentThisMonth?: number; monthlyLimit?: number; limitReached?: boolean;
}
export interface NotificationEmailActionResponse { notificationId: number; status: NotificationEmailStatus; provider: string; }
export interface NotificationEmailTestResponse { status: string; provider: string; }

export type CatalogImportKind = 'clients' | 'products';
export type CatalogImportStatus = 'VALID' | 'INVALID' | 'DUPLICATE';
export interface CatalogImportIssue { field: string; code: string; message: string; }
export interface CatalogImportRow {
  lineNumber: number;
  status: CatalogImportStatus;
  values: Record<string, string | number | null>;
  reasons: CatalogImportIssue[];
  warnings: CatalogImportIssue[];
}
export interface CatalogImportPreview {
  fileName: string;
  delimiter: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  blankRows: number;
  rows: CatalogImportRow[];
}
export interface CatalogImportResult { importedRows: number; ignoredInvalidRows: number; ignoredDuplicateRows: number; }

export interface AuditEventResponse {
  id: number;
  occurredAt: string;
  actorUsername: string;
  action: string;
  entityType: string;
  entityId: number | null;
  entityLabel: string | null;
  summary: string;
}

export interface AuditQuery extends PageQuery {
  from?: string;
  to?: string;
  actor?: string;
  action?: string;
  entityType?: string;
}

export interface ClientOptionResponse {
  id: number;
  legalName: string;
}

export interface ProductOptionResponse {
  id: number;
  sku: string;
  name: string;
}

export interface PartOptionResponse {
  id: number;
  code: string;
  name: string;
  unit: string;
  available: number;
  active: boolean;
}
