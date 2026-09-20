/**
 * Types for the real patient dashboard data, matching the shape returned by
 * GET /api/dashboard/patient (server/src/app.js) and src/services/dashboardApi.js.
 * Keep these in sync with the backend response — they intentionally mirror
 * it rather than an idealized future shape.
 */

export interface Metric {
  key: string;
  title: string;
  value: string;
  hint: string;
}

export type DocumentStatus = 'encrypted' | 'stored';

export interface DocumentRow {
  id: string;
  name: string;
  type: string;
  uploadedBy: string;
  date: string;
  status: DocumentStatus;
}

export type AccessRequestStatus = 'pending' | 'approved' | 'rejected';
export type AccessRequestScope = 'specific_documents' | string;

export interface AccessRequestRow {
  id: string;
  requester: string;
  role: string;
  reason: string;
  scope: AccessRequestScope;
  status: AccessRequestStatus;
  documentIds?: string[];
}

export interface AuditEvent {
  id: string;
  title: string;
  time: string;
  description: string;
}

export interface NotificationSetting {
  id: string;
  channel: string;
  description: string;
  enabled: boolean;
}

export interface PatientDashboardData {
  metrics: Metric[];
  documents: DocumentRow[];
  accessRequests: AccessRequestRow[];
  auditEvents: AuditEvent[];
  notifications: NotificationSetting[];
}

export type PatientView = 'overview' | 'documents' | 'requests' | 'audit' | 'chat' | 'settings' | 'notifications';

export interface NavItem {
  key: PatientView;
  label: string;
  icon: import('react').ReactNode;
  badge?: string;
}
