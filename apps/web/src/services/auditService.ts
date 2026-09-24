/**
 * Audit log admin service — backed by the API (`/api/v1/admin/audit`), read-only.
 * The server writes audit entries transactionally alongside each mutation (append-only,
 * hash-chained), so the client `logAudit` is now a no-op — auditing is server-owned.
 */
import { AuditAction, AuditLogEntry, AuditResult, Resource } from '../types';
import { api, type PageResult } from '../lib/apiClient';

export const getAuditLog = async (): Promise<AuditLogEntry[]> => {
  const page = await api.get<PageResult<AuditLogEntry>>('/admin/audit', { limit: 100 });
  return page.items;
};

export interface AuditInput {
  actorId: string;
  actorName: string;
  actorRole: string;
  action: AuditAction;
  resource: Resource | 'auth';
  target?: string;
  result?: AuditResult;
  metadata?: Record<string, string>;
}

/** No-op: auditing happens server-side on every mutation. Kept for call-site compatibility. */
export const logAudit = (_input: AuditInput): void => {};
