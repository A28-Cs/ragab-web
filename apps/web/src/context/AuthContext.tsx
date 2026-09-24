'use client';

/**
 * Auth context — backed by the real backend. The prototype's insecure behavior is GONE:
 *  - no DEMO_USER auto-login; the app boots LOGGED OUT and asks the server who you are
 *  - permissions come from GET /api/v1/auth/me (server-authoritative), NOT from a
 *    localStorage roleId a user could edit
 *  - login/register/logout call the API; the httpOnly session cookie is the only token
 * `switchRole` is retained as a no-op so any leftover dev caller still compiles.
 */
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { User, Role, Resource, Action, PermissionKey } from '../types';
import { DEFAULT_ROLES, expandPermissions, can, hasAnyAdminAccess as anyAdmin } from '../lib/rbac';
import { api, ApiError } from '../lib/apiClient';

/** Maps Firebase popup sign-in codes to user-facing text (never the raw "Firebase: Error (...)"). */
function providerErrorMessage(code: string): { ar: string; en: string } {
  switch (code) {
    case 'auth/popup-blocked':
      return { ar: 'المتصفح منع نافذة تسجيل الدخول. اسمح بالنوافذ المنبثقة ثم حاول مجددًا.', en: 'The browser blocked the sign-in popup. Allow popups and try again.' };
    case 'auth/network-request-failed':
      return { ar: 'تعذر الاتصال. تحقق من الإنترنت ثم حاول مجددًا.', en: 'Network error. Check your connection and try again.' };
    case 'auth/account-exists-with-different-credential':
      return { ar: 'هذا البريد مسجل بطريقة دخول أخرى. سجّل الدخول بها أولًا.', en: 'This email is already registered with another sign-in method.' };
    case 'auth/unauthorized-domain':
    case 'auth/operation-not-allowed':
    case 'auth/internal-error':
      // Provider not configured in Firebase for this domain/project.
      return { ar: 'طريقة الدخول هذه غير متاحة حاليًا. استخدم رقم الهاتف وكلمة المرور.', en: 'This sign-in method is unavailable right now. Use your phone and password.' };
    default:
      return { ar: 'تعذر تسجيل الدخول. حاول مرة أخرى.', en: 'Sign-in failed. Please try again.' };
  }
}

interface AuthContextType {
  user: User | null;
  isLoggedIn: boolean;
  authReady: boolean;
  login: (identifier: string, password: string) => Promise<{ requires2FA: boolean; challenge?: string }>;
  verifyTwoFactor: (challenge: string, code: string) => Promise<void>;
  register: (input: { name: string; phone: string; email?: string; password: string; defaultVillage?: string }) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (patch: Partial<User>) => void;
  role: Role | null;
  permissions: Set<PermissionKey>;
  hasPermission: (resource: Resource, action: Action) => boolean;
  hasAnyAdminAccess: boolean;
  /** Resolves false when the user dismissed the popup (nothing to report). */
  loginWithProvider: (provider: 'google' | 'apple') => Promise<boolean>;
  verifyEmail: (token: string) => Promise<void>;
  resendEmailVerification: (email: string) => Promise<void>;
  switchRole: (roleId: string | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface MeResponse {
  user: User;
  permissions: PermissionKey[];
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [serverPermissions, setServerPermissions] = useState<PermissionKey[] | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const loadMe = useCallback(async () => {
    try {
      const me = await api.get<MeResponse>('/auth/me');
      setUser(me.user);
      setServerPermissions(me.permissions);
    } catch (e) {
      // 401 simply means "not logged in" — a normal, safe state.
      if (!(e instanceof ApiError) || e.status !== 401) {
        // Non-auth errors are swallowed so a backend hiccup never white-screens the app.
      }
      setUser(null);
      setServerPermissions(null);
    } finally {
      setAuthReady(true);
    }
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  const login = useCallback(async (identifier: string, password: string) => {
    const res = await api.post<{ requires2FA: boolean; challenge?: string; user?: User }>('/auth/login', { identifier, password });
    if (res.requires2FA) return { requires2FA: true, challenge: res.challenge };
    await loadMe();
    return { requires2FA: false };
  }, [loadMe]);

  const verifyTwoFactor = useCallback(async (challenge: string, code: string) => {
    await api.post('/auth/2fa/verify-login', { challenge, code });
    await loadMe();
  }, [loadMe]);

  const register = useCallback(
    async (input: { name: string; phone: string; email?: string; password: string; defaultVillage?: string }) => {
      await api.post('/auth/register', input);
      await loadMe();
    },
    [loadMe],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
      setServerPermissions(null);
    }
  }, []);

  const loginWithProvider = useCallback(async (provider: 'google' | 'apple') => {
    const { signInWithPopup } = await import('firebase/auth');
    const { auth, googleProvider, appleProvider } = await import('../lib/firebase');
    const authProvider = provider === 'google' ? googleProvider : appleProvider;

    let result;
    try {
      result = await signInWithPopup(auth, authProvider);
    } catch (err: any) {
      const code: string = err?.code ?? '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return false;
      console.error('Firebase provider sign-in failed:', code, err);
      throw new ApiError(0, { code, message: providerErrorMessage(code) });
    }
    const idToken = await result.user.getIdToken();

    await api.post('/auth/provider-login', { idToken, provider });
    await loadMe();
    return true;
  }, [loadMe]);

  const verifyEmail = useCallback(async (token: string) => {
    await api.post('/auth/verify-email', { token });
    await loadMe();
  }, [loadMe]);

  const resendEmailVerification = useCallback(async (email: string) => {
    await api.post('/auth/resend-verification', { email });
  }, []);

  const updateUser = useCallback((patch: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  // No-op: client-side role switching is a security hole and is gone.
  const switchRole = useCallback((_roleId: string | null) => {}, []);

  const role = useMemo<Role | null>(() => {
    if (!user?.roleId) return null;
    return DEFAULT_ROLES.find((r) => r.id === user.roleId) ?? null;
  }, [user?.roleId]);

  // Permissions are whatever the SERVER returned; the role/direct fallback only applies
  // before /me has answered (it never grants more than the server would).
  const permissions = useMemo<Set<PermissionKey>>(() => {
    if (serverPermissions) return new Set(serverPermissions);
    return expandPermissions(role?.permissions, user?.directPermissions);
  }, [serverPermissions, role, user?.directPermissions]);

  const value: AuthContextType = {
    user,
    isLoggedIn: !!user,
    authReady,
    login,
    verifyTwoFactor,
    register,
    logout,
    updateUser,
    role,
    permissions,
    hasPermission: (resource, action) => can(permissions, resource, action),
    hasAnyAdminAccess: anyAdmin(permissions),
    loginWithProvider,
    verifyEmail,
    resendEmailVerification,
    switchRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
