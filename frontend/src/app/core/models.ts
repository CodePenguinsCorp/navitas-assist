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
  contactName: string | null;
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
  contactName: string | null;
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
  boardPosition: number;
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

export interface RmaPositionUpdateRequest {
  expectedStatus: RmaStatus;
  anchorId: number;
  after: boolean;
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

export interface ReportCard {
  title: string;
  description: string;
  frequency: string;
  format: string;
}

export interface AccessMatrixItem {
  role: UserRole;
  access: string;
}
