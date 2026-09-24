'use client';

import React from 'react';
import { useAuth } from '../../context/AuthContext';
import type { Action, Resource } from '../../types';

/** Hook: returns a checker bound to the current user's permissions */
export function usePermission() {
  const { hasPermission, permissions, hasAnyAdminAccess } = useAuth();
  return { can: hasPermission, permissions, hasAnyAdminAccess };
}

interface CanProps {
  resource: Resource;
  action: Action;
  children: React.ReactNode;
  /** Rendered instead of children when the permission is missing */
  fallback?: React.ReactNode;
}

/**
 * Gate a piece of UI (an action control, a nav item) behind a permission.
 * This is the *presentation* layer of enforcement — pair it with guarded
 * service actions (assertCan) so the permission is enforced for real.
 */
export const Can: React.FC<CanProps> = ({ resource, action, children, fallback = null }) => {
  const { hasPermission } = useAuth();
  return <>{hasPermission(resource, action) ? children : fallback}</>;
};
