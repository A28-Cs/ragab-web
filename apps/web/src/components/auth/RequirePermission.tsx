'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { AuthStatePanel } from './AuthStatePanel';
import type { Action, Resource } from '../../types';

interface RequireAuthProps {
  children: React.ReactNode;
  /** When set, also require this specific permission (Forbidden if missing) */
  resource?: Resource;
  action?: Action;
  /** Require any admin-surface access (used by the Control Center shell) */
  requireAdmin?: boolean;
}

/**
 * Route/section guard. Distinguishes the two failure modes the spec calls out:
 *  - not logged in            → Unauthorized (401-style) panel
 *  - logged in but no access  → Forbidden (403-style) panel
 * Waits on `authReady` so it never flashes Unauthorized during hydration.
 */
export const RequirePermission: React.FC<RequireAuthProps> = ({
  children,
  resource,
  action,
  requireAdmin,
}) => {
  const { authReady, isLoggedIn, hasPermission, hasAnyAdminAccess, user } = useAuth();

  if (!authReady) {
    return (
      <div className="flex items-center justify-center py-24" aria-busy>
        <Loader2 className="w-7 h-7 animate-spin text-ragab-ink-400" />
      </div>
    );
  }

  if (!isLoggedIn) return <AuthStatePanel variant="unauthorized" />;

  // Account-state gates (human-friendly, before permission checks)
  if (user?.status === 'disabled') return <AuthStatePanel variant="disabled" />;
  if (user?.status === 'suspended') return <AuthStatePanel variant="suspended" />;

  if (requireAdmin && !hasAnyAdminAccess) return <AuthStatePanel variant="forbidden" />;

  if (resource && action && !hasPermission(resource, action)) {
    return <AuthStatePanel variant="forbidden" />;
  }

  return <>{children}</>;
};
