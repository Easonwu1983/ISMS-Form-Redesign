/**
 * ISMS Contract Type Definitions
 * 提供所有 API 合約的 TypeScript 型別定義
 */

// ── Common Types ──

export interface ApiError extends Error {
  statusCode: number;
}

export interface ActionEnvelope<T = any> {
  action: string;
  payload: T;
}

export interface JsonResponse<T = any> {
  status: number;
  jsonBody: {
    ok: boolean;
    error?: string;
    contractVersion?: string;
  } & T;
}

// ── System User Types ──

export type UserRole = '最高管理員' | '單位管理員';
export type SecurityRole = '一級單位資安窗口' | '二級單位資安窗口';

export interface SystemUser {
  username: string;
  name: string;
  email: string;
  role: UserRole;
  securityRoles: SecurityRole[];
  primaryUnit: string;
  authorizedUnits: string[];
  activeUnit: string;
  sessionVersion: number;
  hasPassword: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SystemUserPayload {
  username: string;
  password?: string;
  name: string;
  email: string;
  role: UserRole;
  securityRoles?: SecurityRole[];
  primaryUnit?: string;
  authorizedUnits?: string[];
  activeUnit?: string;
}

// ── Checklist Types ──

export type ChecklistStatus = '草稿' | '已送出';
export type SignStatus = '待簽核' | '已簽核';
export type ComplianceValue = '符合' | '部分符合' | '不符合' | '不適用';

export interface ChecklistResult {
  compliance: ComplianceValue;
  execution: string;
  evidence: string;
  evidenceFiles: AttachmentDescriptor[];
}

export interface Checklist {
  id: string;
  checklistId: string;
  unit: string;
  fillerName: string;
  fillerUsername: string;
  fillDate: string;
  auditYear: string;
  supervisorName: string;
  supervisorTitle: string;
  signStatus: SignStatus;
  status: ChecklistStatus;
  results: Record<string, ChecklistResult>;
  summary: ChecklistSummary;
}

export interface ChecklistSummary {
  total: number;
  conform: number;
  partial: number;
  nonConform: number;
  na: number;
}

// ── Corrective Action Types ──

export type CorrectiveStatus = '開立' | '待矯正' | '已提案' | '審核中' | '追蹤中' | '結案';
export type DeficiencyType = '主要缺失' | '次要缺失' | '觀察' | '建議';

export interface CorrectiveAction {
  id: string;
  caseId: string;
  proposerUnit: string;
  proposerName: string;
  proposerDate: string;
  handlerUnit: string;
  handlerName: string;
  handlerEmail: string;
  deficiencyType: DeficiencyType;
  source: string;
  category: string[];
  problemDesc: string;
  occurrence: string;
  correctiveAction: string;
  correctiveDueDate: string;
  rootCause: string;
  status: CorrectiveStatus;
  evidence: AttachmentDescriptor[];
  history: HistoryEntry[];
  trackings: Tracking[];
  closedDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface HistoryEntry {
  time: string;
  action: string;
  user: string;
}

export interface Tracking {
  round: number;
  tracker: string;
  trackDate: string;
  execution: string;
  trackNote: string;
  result: string;
  decision: string;
  reviewer: string;
  reviewDate: string;
  nextTrackDate: string;
  evidence: AttachmentDescriptor[];
}

// ── Training Types ──

export type TrainingStatus = '暫存' | '待簽核' | '已完成填報' | '退回更正';
export type RosterSource = 'import' | 'manual';

export interface TrainingForm {
  id: string;
  formId: string;
  unit: string;
  statsUnit: string;
  fillerName: string;
  fillerUsername: string;
  fillDate: string;
  trainingYear: string;
  status: TrainingStatus;
  records: TrainingRecord[];
  summary: TrainingSummary;
  completionRate: number;
}

export interface TrainingRecord {
  rosterId: string;
  name: string;
  unitName: string;
  identity: string;
  jobTitle: string;
  employeeStatus: string;
  generalTraining: string;
  infoStaffTraining: string;
  professionalTraining: string;
  result: string;
  note: string;
}

export interface TrainingSummary {
  activeCount: number;
  completedCount: number;
  incompleteCount: number;
  completionRate: number;
}

export interface TrainingRoster {
  id: string;
  rosterId: string;
  unit: string;
  name: string;
  unitName: string;
  identity: string;
  jobTitle: string;
  source: RosterSource;
}

// ── Attachment Types ──

export interface AttachmentDescriptor {
  attachmentId: string;
  name: string;
  type: string;
  contentType: string;
  size: number;
  extension: string;
  scope: string;
  ownerId: string;
  storage: 'local' | 'm365' | 'local-fs';
}

// ── Unit Contact Application Types ──

export type ApplicationStatus = 'pending_review' | 'returned' | 'approved' | 'rejected' | 'activation_pending' | 'active';

export interface UnitContactApplication {
  id: string;
  applicationId: string;
  applicantName: string;
  applicantEmail: string;
  extensionNumber: string;
  unitValue: string;
  primaryUnit: string;
  secondaryUnit: string;
  securityRoles: SecurityRole[];
  status: ApplicationStatus;
  submittedAt: string;
  reviewedAt: string;
  reviewComment: string;
}

// ── Dashboard Types ──

export interface DashboardSummary {
  checklist: {
    totalUnits: number;
    submittedUnits: number;
    notFiledUnits: number;
    draftCount: number;
    submittedCount: number;
    auditYear: string;
    byUnit: Array<{ unit: string; status: string; count: number }>;
  };
  training: {
    totalForms: number;
    completedForms: number;
    draftForms: number;
    pendingForms: number;
    returnedForms: number;
    avgCompletionRate: number;
    trainingYear: string;
    byStatsUnit: Array<{ statsUnit: string; status: string; formCount: number; avgRate: number }>;
  };
  pending: {
    applicationsPendingReview: number;
    activationPending: number;
    correctivePending: number;
    correctiveProposed: number;
    correctiveTracking: number;
    correctiveOpenTotal: number;
    totalPendingItems: number;
  };
  generatedAt: string;
}

export interface MyTasks {
  tasks: Array<{
    type: 'checklist' | 'corrective' | 'training';
    priority: 'urgent' | 'high' | 'medium';
    title: string;
    subtitle?: string;
    action: string;
    route: string;
  }>;
  summary: {
    checklistStatus: string;
    openCases: number;
    pendingCases: number;
    trainingStatus: string;
  };
  units: string[];
  auditYear: string;
}

// ── Unit Structure Types ──

export interface UnitMeta {
  value: string;
  topCode: string;
  topName: string;
  code: string;
  normalizedCode: string;
  name: string;
  fullName: string;
  childName: string;
  isTop: boolean;
  label: string;
}

export interface UnitStructure {
  [parentUnit: string]: string[];
}
