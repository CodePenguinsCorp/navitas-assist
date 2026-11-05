export type UserRole = 'ADMIN' | 'TECHNICIAN' | 'SERVICE_DESK' | 'VIEWER';

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
  role: UserRole;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface UserAccountResponse {
  id: number;
  username: string;
  fullName: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AssignableUserResponse {
  id: number;
  username: string;
  fullName: string;
}

export type AuthUserResponse = UserAccountResponse;

export interface UserAccountRequest {
  username: string;
  fullName: string;
  password: string;
  role: UserRole;
  active: boolean;
}

export interface UserAccountUpdateRequest {
  username: string;
  fullName: string;
  password: string | null;
  role: UserRole;
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
  invoiceNumber: string | null;
  receivedBy: string;
  reportedFailure: string;
  receivedAccessories: string | null;
  physicalCondition: string | null;
  priority: RmaPriority;
  status: RmaStatus;
  sla: RmaSlaResponse;
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
  assignmentHistory: RmaAssignmentHistoryResponse[];
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
  recipientRoles: UserRole[];
  notifyAssignee: boolean;
  emailEnabled: boolean;
  userMutable: boolean;
}

export interface NotificationRuleResponse extends NotificationRuleRequest {
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

export type ScanSource = 'CAMERA' | 'SCANNER' | 'MANUAL';

export interface ScanCodeResponse {
  rmaId: number;
  rmaCode: string;
  token: string;
  createdAt: string;
  createdBy: string;
}

export interface ScanStatusChangeRequest {
  expectedStatus: RmaStatus;
  status: RmaStatus;
  note: string | null;
  source: ScanSource;
  confirmed: boolean;
}

export interface NavItem {
  label: string;
  route: string;
  roles: UserRole[];
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

export interface ModuleCard {
  title: string;
  summary: string;
  route: string;
  tag: string;
  roles: UserRole[];
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

export type StorageLocationType = 'AREA' | 'BENCH' | 'SHELF' | 'QUARANTINE' | 'SHIPPING';

export type CustodyMovementType = 'ENTRY' | 'TRANSFER' | 'EXIT';

export type CustodyFlag = 'OK' | 'MISSING' | 'STALE';

export interface StorageLocationRequest {
  code: string;
  name: string;
  type: StorageLocationType;
  parentId: number | null;
  description: string | null;
  active: boolean;
}

export interface StorageLocationResponse {
  id: number;
  code: string;
  name: string;
  type: StorageLocationType;
  parentId: number | null;
  parentName: string | null;
  description: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustodyMovementRequest {
  type: CustodyMovementType;
  toLocationId: number | null;
  custodianId: number | null;
  reason: string | null;
}

export interface CustodyMovementResponse {
  id: number;
  type: CustodyMovementType;
  fromLocationId: number | null;
  fromLocationName: string | null;
  toLocationId: number | null;
  toLocationName: string | null;
  custodianId: number | null;
  custodianName: string | null;
  reason: string | null;
  performedBy: string;
  performedAt: string;
}

export interface RmaCustodyResponse {
  rmaId: number;
  rmaCode: string;
  rmaStatus: RmaStatus;
  clientName: string;
  productName: string;
  locationId: number | null;
  locationCode: string | null;
  locationName: string | null;
  locationType: StorageLocationType | null;
  custodianId: number | null;
  custodianName: string | null;
  since: string | null;
  flag: CustodyFlag;
}

export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface CustodySummaryResponse {
  tracked: number;
  missing: number;
  stale: number;
}

export interface RmaCustodyDetailResponse {
  current: RmaCustodyResponse;
  movements: CustodyMovementResponse[];
}

export type ShipmentType = 'PICKUP' | 'POSTING' | 'TRANSFER' | 'RETURN';

export type ShipmentStatus = 'CREATED' | 'LABEL_ISSUED' | 'IN_TRANSIT' | 'DELIVERY_ATTEMPT' | 'EXCEPTION' | 'DELIVERED' | 'CANCELLED';

export type ShipmentEventSource = 'SYSTEM' | 'INTEGRATION' | 'MANUAL';

export interface ShipmentFieldsRequest {
  type: ShipmentType;
  originName: string;
  originAddress: string | null;
  destinationName: string;
  destinationAddress: string | null;
  volumes: number;
  carrier: string;
  serviceName: string | null;
  trackingCode: string | null;
  labelReference: string | null;
  cost: string | null;
}

export interface CreateShipmentRequest extends ShipmentFieldsRequest {
  rmaId: number;
}

export interface UpdateShipmentRequest extends ShipmentFieldsRequest {
  justification: string;
}

export interface ManualShipmentEventRequest {
  status: ShipmentStatus;
  description: string | null;
  proofReference: string | null;
  occurredAt: string | null;
  justification: string;
}

export interface ShipmentResponse {
  id: number;
  rmaId: number;
  rmaCode: string;
  type: ShipmentType;
  status: ShipmentStatus;
  originName: string;
  originAddress: string | null;
  destinationName: string;
  destinationAddress: string | null;
  addressRestricted: boolean;
  addressesPurged: boolean;
  volumes: number;
  carrier: string;
  serviceName: string | null;
  trackingCode: string | null;
  labelReference: string | null;
  cost: number | null;
  deliveryAttempts: number;
  closedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentEventResponse {
  id: number;
  source: ShipmentEventSource;
  externalEventId: string | null;
  status: ShipmentStatus;
  description: string | null;
  proofReference: string | null;
  justification: string | null;
  occurredAt: string;
  recordedBy: string;
  recordedAt: string;
}

export interface ShipmentDetailResponse {
  shipment: ShipmentResponse;
  events: ShipmentEventResponse[];
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
