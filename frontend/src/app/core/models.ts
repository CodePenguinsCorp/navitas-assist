export type UserRole = 'ADMIN' | 'TECHNICIAN' | 'SERVICE_DESK' | 'VIEWER';

export type MetricTone = 'brand' | 'sky' | 'slate' | 'light';

export type HealthState = 'checking' | 'online' | 'offline';

export type RmaPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export type WarrantyStatus = 'PENDING' | 'IN_WARRANTY' | 'OUT_OF_WARRANTY';

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
  authHeader: string;
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

export type AuthUserResponse = UserAccountResponse;

export interface UserAccountRequest {
  username: string;
  fullName: string;
  password: string;
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

export interface CreateRmaRequest {
  clientId: number;
  productId: number;
  batchNumber: string | null;
  serialNumber: string | null;
  manufacturedAt: string | null;
  purchaseDate: string | null;
  purchaseDateUnknown: boolean;
  entryDate: string;
  invoiceNumber: string | null;
  invoiceFileName: string | null;
  receivedBy: string;
  reportedFailure: string;
  receivedAccessories: string | null;
  physicalCondition: string | null;
  priority: RmaPriority;
  warrantyStatusOverride: WarrantyStatus | null;
  warrantyJustification: string | null;
  repairSummary: string | null;
  replacedPartsSummary: string | null;
  testSummary: string | null;
}

export interface RmaStatusUpdateRequest {
  status: RmaStatus;
  note: string | null;
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

export interface RmaResponse {
  id: number;
  code: string;
  clientId: number;
  clientName: string;
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
  invoiceFileName: string | null;
  receivedBy: string;
  reportedFailure: string;
  receivedAccessories: string | null;
  physicalCondition: string | null;
  priority: RmaPriority;
  status: RmaStatus;
  warrantyStatus: WarrantyStatus;
  warrantyOverridden: boolean;
  warrantyJustification: string | null;
  warrantyUpdatedBy: string | null;
  warrantyUpdatedAt: string | null;
  repairSummary: string | null;
  replacedPartsSummary: string | null;
  testSummary: string | null;
  shippedAt: string | null;
  carrier: string | null;
  trackingCode: string | null;
  diagnosis: DiagnosisResponse | null;
  statusHistory: RmaStatusHistoryResponse[];
  createdAt: string;
  updatedAt: string;
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
