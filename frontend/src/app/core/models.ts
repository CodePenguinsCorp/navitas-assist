import type { IconName } from '../shared/icon/icon.component';
import type { Permission } from './permissions';

export type MetricTone = 'brand' | 'sky' | 'slate' | 'light';

export type HealthState = 'checking' | 'online' | 'offline';

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
  createdAt: string;
  updatedAt: string;
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

/** `GET /api/profiles` e `/api/profiles/{id}`: permissões na ordem do catálogo. */
export interface ProfileResponse {
  id: number;
  name: string;
  permissions: string[];
  userCount: number;
  createdAt: string;
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

/** Usuário da sessão (`POST /api/auth/login` e `GET /api/auth/me`), com as permissões efetivas na ordem do catálogo. */
export interface CurrentUserResponse extends UserAccountResponse {
  permissions: string[];
}

export type AuthUserResponse = CurrentUserResponse;

export interface UserAccountRequest {
  username: string;
  fullName: string;
  password: string;
  profileId: number;
  extraPermissions: Permission[];
  active: boolean;
}

export interface UserAccountUpdateRequest {
  username: string;
  fullName: string;
  password: string | null;
  profileId: number;
  extraPermissions: Permission[];
  active: boolean;
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
  createdAt: string;
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
  createdAt: string;
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
  id: number;
  foundFailure: string | null;
  failureType: FailureType | null;
  probableCause: FailureCause | null;
  notes: string | null;
  diagnosedAt: string | null;
  technicianName: string | null;
  createdAt: string;
  updatedAt: string;
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

export interface RmaBulkStatusUpdateRequest extends RmaStatusUpdateRequest {
  expectedStatus: RmaStatus;
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
  createdAt: string;
  updatedAt: string;
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
  status: RmaStatus;
  changedBy: string;
  changedAt: string;
  note: string | null;
}

export interface RmaAssignmentHistoryResponse {
  previousAssigneeId: number | null;
  previousAssigneeName: string | null;
  newAssigneeId: number | null;
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

export interface RmaItemResponse {
  id: number | null;
  productId: number;
  productName: string;
  productSku: string;
  batchNumber: string | null;
  serialNumber: string | null;
  manufacturedAt: string | null;
  warrantyMonths: number;
  warrantyExpiresAt: string | null;
  warrantyStatus: WarrantyStatus;
}

export type RmaSlaStatus = 'NORMAL' | 'WARNING' | 'OVERDUE' | 'CLOSED';

export interface RmaSlaResponse {
  status: RmaSlaStatus;
  startedAt: string;
  warningAt: string | null;
  dueAt: string | null;
  elapsedSeconds: number;
  limitSeconds: number | null;
}

export type RmaDeadlineStatus = 'OVERDUE' | 'DUE_SOON' | 'ON_TRACK' | 'NO_DUE_DATE' | 'CLOSED';

export interface RmaDeadlineResponse {
  status: RmaDeadlineStatus;
  dueSoonFrom: string | null;
  daysUntilDue: number | null;
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

export interface RmaResponse {
  id: number;
  code: string;
  clientId: number;
  clientName: string;
  items: RmaItemResponse[];
  productId: number;
  productName: string;
  productSku: string;
  batchNumber: string | null;
  serialNumber: string | null;
  manufacturedAt: string | null;
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
  sla: RmaSlaResponse;
  deadline: RmaDeadlineResponse;
  assigneeId: number | null;
  assigneeName: string | null;
  repairSummary: string | null;
  replacedPartsSummary: string | null;
  testSummary: string | null;
  shippedAt: string | null;
  carrier: string | null;
  trackingCode: string | null;
  diagnosis: DiagnosisResponse | null;
  statusHistory: RmaStatusHistoryResponse[];
  stagePeriods: RmaStagePeriodResponse[];
  assignmentHistory: RmaAssignmentHistoryResponse[];
  dueDateHistory: RmaDueDateHistoryResponse[];
  currentBlock: RmaBlockResponse | null;
  blockHistory: RmaBlockResponse[];
  createdAt: string;
  updatedAt: string;
}

export type NotificationEventType =
  | 'RMA_CREATED'
  | 'RMA_ASSIGNED'
  | 'SLA_WARNING'
  | 'SLA_OVERDUE'
  | 'RMA_BLOCKED'
  | 'WIP_LIMIT_EXCEEDED'
  | 'PART_PENDING'
  | 'INTERNAL_APPROVAL_REQUIRED'
  | 'TEST_FAILED'
  | 'RECURRENCE_DETECTED';

export type NotificationSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface NotificationResponse {
  id: number;
  eventType: NotificationEventType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  rmaId: number | null;
  rmaCode: string | null;
  actionPath: string | null;
  createdAt: string;
  readAt: string | null;
  snoozedUntil: string | null;
  read: boolean;
}

export interface NotificationSummaryResponse {
  unread: number;
}

export interface NotificationPreferenceResponse {
  eventType: NotificationEventType;
  severity: NotificationSeverity;
  enabled: boolean;
  userMutable: boolean;
  muted: boolean;
}

export interface NotificationRuleRequest {
  enabled: boolean;
  severity: NotificationSeverity;
  recipientProfileIds: number[];
  notifyAssignee: boolean;
  emailEnabled: boolean;
  userMutable: boolean;
}

export interface NotificationRuleResponse extends Omit<NotificationRuleRequest, 'recipientProfileIds'> {
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
  createdAt: string;
  updatedAt: string;
}

export interface PartMovementRequest {
  type: ManualPartMovementType;
  quantity: number;
  reason: string | null;
}

export interface PartReversalRequest {
  reason: string;
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
  unitCost: number;
  totalCost: number;
  rmaId: number | null;
  rmaCode: string | null;
  reservationId: number | null;
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
  unitCost: number;
  totalCost: number;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RmaPartsResponse {
  rmaId: number;
  rmaCode: string;
  reservations: PartReservationResponse[];
  movements: PartMovementResponse[];
  reservedCost: number;
  consumedCost: number;
  pendingCount: number;
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

export interface RmaReportResponse {
  generatedAt: string;
  entryFrom: string;
  entryTo: string;
  rmas: RmaResponse[];
}


export interface NavItem {
  label: string;
  route: string;
  icon: IconName;
  /** Todas exigidas; vazio = só login. */
  permissions: Permission[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export interface MetricCard {
  label: string;
  value: string;
  variation: string;
  tone: MetricTone;
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
  withContact: number;
  withDocument: number;
  withEmail: number;
}

export interface ProductSummaryResponse {
  total: number;
  withFirmware: number;
  averageWarrantyMonths: number;
  categories: string[];
}

export interface UserSummaryResponse {
  total: number;
  active: number;
  admins: number;
  roles: number;
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
