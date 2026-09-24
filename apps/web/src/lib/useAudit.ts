'use client';

import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { logAudit } from '../services/auditService';
import type { AuditAction, AuditResult, Resource } from '../types';

/**
 * Returns a `record` fn that logs an administrative event to the audit log,
 * stamped with the current staff actor. Call it at the UI layer right after a
 * guarded mutation succeeds (the actor context lives here, not in the service).
 */
export function useAudit() {
  const { user, role } = useAuth();

  const record = useCallback(
    (
      action: AuditAction,
      resource: Resource | 'auth',
      target?: string,
      opts?: { result?: AuditResult; metadata?: Record<string, string> }
    ) => {
      logAudit({
        actorId: user?.id ?? 'unknown',
        actorName: user?.name ?? '—',
        actorRole: role?.nameEn ?? '—',
        action,
        resource,
        target,
        result: opts?.result,
        metadata: opts?.metadata,
      });
    },
    [user?.id, user?.name, role?.nameEn]
  );

  return record;
}
