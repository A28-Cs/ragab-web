/**
 * Auth service (§9, §10). Registration, login, logout, verification, password reset,
 * session management. Security properties enforced here:
 *  - Passwords: Argon2id only; never stored/compared in plaintext.
 *  - Anti-enumeration: login and reset-request return identically whether or not the
 *    account exists, and burn comparable time (dummyVerify).
 *  - Throttling: the route layer rate-limits login/register/reset per IP+account.
 *  - Least privilege: registration ALWAYS creates a customer (isStaff=false, no role);
 *    staff are provisioned only through the admin users module.
 *  - Session rotation: a new session is minted on login; password change revokes all
 *    other sessions (§10 logout-everywhere).
 */
import { and, desc, eq } from 'drizzle-orm';
import type { RequestContext } from '../../http/context';
import { db } from '../../db/client';
import {
  users,
  sessions,
  verificationTokens,
  loginActivity,
  notificationPreferences,
  profiles,
  mfaSecrets,
  deviceTokens,
  addresses,
  wishlists,
  carts,
  notifications,
  emailEvents,
} from '../../db/schema';
import {
  AuthenticationError,
  ConflictError,
  ValidationError,
} from '../../lib/errors';
import { hashPassword, verifyPassword, dummyVerify } from '../../security/password';
import { generateToken, hashToken, generateNumericOtp } from '../../security/tokens';
import {
  SESSION_COOKIE,
  createSession,
  revokeSession,
  revokeAllSessions,
  loadPermissions,
} from '../../security/session';
import { newCsrfToken, CSRF_COOKIE } from '../../security/csrf';
import { serverEnv } from '../../config/env';
import { logAudit } from '../audit';
import { mergeAnonymousCart } from '../cart/service';
import { issueLoginChallenge, verifyLoginChallenge, checkTwoFactorCode } from './twofa';
import { sendEmail, verificationEmail, passwordResetEmail } from '../../lib/email';
import { sendSms, otpSms } from '../../lib/sms';
import { deleteObjectByUrl } from '../../lib/storage';
import { publicEnv } from '../../config/env';
import { toUserDto } from './mapper';
import { newId } from '../../lib/ids';
import type { RegisterInput, LoginInput, ResetPasswordInput, ChangePasswordInput, DeleteAccountInput } from './schema';
import type { User } from '../../types';
import type { PermissionKey } from '../../security/permissions';

const RESET_TTL_MS = 30 * 60 * 1000; // 30 minutes

/** Attach the session + CSRF cookies to the response and return the user DTO. */
async function establishSession(userId: string, ctx: RequestContext): Promise<void> {
  const dev = ctx.deviceInfo();
  const { token, expiresAt } = await createSession(
    userId,
    {
      device: dev.device,
      deviceType: dev.deviceType,
      browser: dev.browser,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    },
    undefined,
    undefined,
    // Native clients get the longer absolute cap (§7).
    ctx.isNativeClient
      ? { absoluteTtlSeconds: serverEnv().SESSION_MOBILE_ABSOLUTE_TTL_SECONDS }
      : {},
  );
  const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
  ctx.setCookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'Lax', maxAge });
  // CSRF token cookie is readable by JS (double-submit); NOT HttpOnly by design.
  // Rotate a fresh readable CSRF token on session establishment (double-submit).
  ctx.setCookie(CSRF_COOKIE, newCsrfToken(), { httpOnly: false, sameSite: 'Lax', maxAge });
  // Record the raw token on the context so a native response can return it in the body
  // (browsers use the HttpOnly cookie above and leave this unread). See http/context.ts.
  ctx.issuedToken = { token, expiresAt };
}

export async function register(input: RegisterInput, ctx: RequestContext): Promise<User> {
  const existing = await db().select({ id: users.id }).from(users).where(eq(users.phone, input.phone)).limit(1);
  if (existing.length > 0) {
    // Do not reveal which field collided beyond what a user needs to recover.
    throw new ConflictError({
      code: 'PHONE_ALREADY_REGISTERED',
      message: { ar: 'رقم الهاتف مسجل بالفعل.', en: 'This phone number is already registered.' },
    });
  }

  const passwordHash = await hashPassword(input.password);
  const user = await db().transaction(async (tx) => {
    const [row] = await tx
      .insert(users)
      .values({
        name: input.name,
        phone: input.phone,
        email: input.email ?? null,
        passwordHash,
        defaultVillage: input.defaultVillage ?? '',
        status: 'pending_verification',
        isStaff: false, // hard invariant: registration never creates staff
        roleId: null,
      })
      .returning();
    await tx.insert(profiles).values({ userId: row!.id }).onConflictDoNothing();
    await tx.insert(notificationPreferences).values({ userId: row!.id }).onConflictDoNothing();
    return row!;
  });

  // Priority: if email is present, verify via email. Otherwise, verify via phone.
  if (user.email) {
    await issueEmailVerificationLink(user.id, user.email, ctx);
  } else {
    await issuePhoneOtp(user.id, user.phone, null);
  }
  await establishSession(user.id, ctx);
  await mergeAnonymousCart(ctx, user.id);
  await logAudit({
    actorId: user.id,
    actorName: user.name,
    actorRole: 'customer',
    action: 'user_created',
    resource: 'auth',
    result: 'success',
    requestId: ctx.requestId,
    ipAddress: ctx.ip,
  });
  return toUserDto(user);
}

export type LoginResult = { requires2FA: false; user: User } | { requires2FA: true; challenge: string };

/**
 * The session token to return in a NATIVE auth response body (login/register/2FA).
 * `undefined` for browser clients — they receive the HttpOnly cookie instead and this
 * must stay absent so their response is byte-identical to before the mobile transport.
 */
export function nativeSession(ctx: RequestContext): { token: string; expiresAt: string } | undefined {
  if (!ctx.isNativeClient || !ctx.issuedToken) return undefined;
  return { token: ctx.issuedToken.token, expiresAt: ctx.issuedToken.expiresAt.toISOString() };
}

export async function login(input: LoginInput, ctx: RequestContext): Promise<LoginResult> {
  const isEmail = input.identifier.includes('@');
  const [user] = await db()
    .select()
    .from(users)
    .where(isEmail ? eq(users.email, input.identifier) : eq(users.phone, input.identifier))
    .limit(1);

  if (!user || !user.passwordHash) {
    await dummyVerify(input.password); // equalize timing on unknown users
    await recordLogin(null, input.identifier, ctx, 'failed');
    throw invalidCredentials();
  }

  const okPassword = await verifyPassword(user.passwordHash, input.password);
  if (!okPassword) {
    await recordLogin(user.id, input.identifier, ctx, 'failed');
    throw invalidCredentials();
  }

  if (user.status === 'disabled' || user.status === 'suspended') {
    await recordLogin(user.id, input.identifier, ctx, 'failed');
    throw new AuthenticationError({
      code: 'ACCOUNT_DISABLED',
      message: { ar: 'تم تعطيل هذا الحساب.', en: 'This account has been disabled.' },
    });
  }

  // Prevent login if email is unverified
  if (isEmail && !user.emailVerified) {
    await recordLogin(user.id, input.identifier, ctx, 'failed');
    throw new AuthenticationError({
      code: 'ACCOUNT_UNVERIFIED',
      message: { ar: 'البريد الإلكتروني غير مؤكد.', en: 'Email address is not verified.' },
    });
  }

  // 2FA gate: password is correct, but a second factor is required before a session
  // is issued. We return a signed, short-lived challenge instead of logging in.
  if (user.twoFactorEnabled) {
    return { requires2FA: true, challenge: issueLoginChallenge(user.id) };
  }

  await finishLogin(user, ctx, input.identifier);
  return { requires2FA: false, user: toUserDto(user) };
}

/** Complete a 2FA login: verify the challenge + code, then establish the session. */
export async function completeTwoFactorLogin(challenge: string, code: string, ctx: RequestContext): Promise<User> {
  const userId = verifyLoginChallenge(challenge);
  if (!userId) throw new AuthenticationError({ code: 'INVALID_2FA_CHALLENGE', message: { ar: 'انتهت صلاحية جلسة التحقق. سجّل الدخول من جديد.', en: 'Verification session expired. Please sign in again.' } });
  const [user] = await db().select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw invalidCredentials();
  const ok = await checkTwoFactorCode(userId, code);
  if (!ok) {
    await recordLogin(userId, user.phone, ctx, 'failed');
    throw new AuthenticationError({ code: 'INVALID_2FA_CODE', message: { ar: 'رمز التحقق غير صحيح.', en: 'Invalid verification code.' } });
  }
  await finishLogin(user, ctx, user.phone);
  return toUserDto(user);
}

/** Shared post-authentication steps (session, cart merge, audit). */
async function finishLogin(user: typeof users.$inferSelect, ctx: RequestContext, identifier: string): Promise<void> {
  await db().update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await establishSession(user.id, ctx);
  await mergeAnonymousCart(ctx, user.id);
  await recordLogin(user.id, identifier, ctx, 'success');
  await logAudit({
    actorId: user.id,
    actorName: user.name,
    actorRole: user.isStaff ? 'staff' : 'customer',
    action: 'login',
    resource: 'auth',
    result: 'success',
    requestId: ctx.requestId,
    ipAddress: ctx.ip,
  });
}

export async function logout(ctx: RequestContext): Promise<void> {
  if (ctx.principal) {
    await revokeSession(ctx.principal.sessionId);
    await logAudit({
      actorId: ctx.principal.userId,
      actorName: ctx.principal.user.name,
      actorRole: ctx.principal.isStaff ? 'staff' : 'customer',
      action: 'logout',
      resource: 'auth',
      requestId: ctx.requestId,
    });
  }
  ctx.clearCookie(SESSION_COOKIE);
  ctx.clearCookie(CSRF_COOKIE, { httpOnly: false });
}

/** /me — the current principal, with effective permissions for the client to gate UI. */
export async function me(ctx: RequestContext): Promise<{ user: User; permissions: PermissionKey[] }> {
  if (!ctx.principal) {
    throw new AuthenticationError({ message: { ar: 'غير مسجل الدخول.', en: 'Not authenticated.' } });
  }
  const permissions = [...ctx.principal.permissions];
  return { user: toUserDto(ctx.principal.user, directGrants(ctx.principal.permissions)), permissions };
}

/** Direct grants are a subset; we surface the whole set as directPermissions for the UI. */
function directGrants(perms: Set<PermissionKey>): PermissionKey[] {
  return [...perms];
}

export async function requestPasswordReset(phone: string, ctx: RequestContext): Promise<void> {
  const [user] = await db().select().from(users).where(eq(users.phone, phone)).limit(1);
  // Always behave identically (§9 anti-enumeration): if no user, do nothing but return ok.
  if (user) {
    const token = generateToken(32);
    await db().insert(verificationTokens).values({
      userId: user.id,
      purpose: 'password_reset',
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    });
    // Deliver the reset link by email (fire-and-forget). SMS delivery can be added the
    // same way once a gateway is configured.
    const resetUrl = `${publicEnv().NEXT_PUBLIC_APP_URL}/forgot-password?token=${token}`;
    if (user.email) {
      const tpl = passwordResetEmail(resetUrl);
      void sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html, text: tpl.text, userId: user.id, template: 'password_reset' });
    }
    if (serverEnv().NODE_ENV !== 'production') {
      ctx.log.info({ resetToken: '[issued]' }, 'password reset token issued (dev)');
    }
  }
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const tokenHash = hashToken(input.token);
  const [record] = await db()
    .select()
    .from(verificationTokens)
    .where(and(eq(verificationTokens.tokenHash, tokenHash), eq(verificationTokens.purpose, 'password_reset')))
    .limit(1);

  if (!record || record.consumedAt || record.expiresAt < new Date()) {
    throw new ValidationError({
      code: 'INVALID_RESET_TOKEN',
      message: { ar: 'رابط إعادة التعيين غير صالح أو منتهي.', en: 'Reset link is invalid or expired.' },
    });
  }

  const passwordHash = await hashPassword(input.password);
  await db().transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, record.userId));
    await tx.update(verificationTokens).set({ consumedAt: new Date() }).where(eq(verificationTokens.id, record.id));
    // Password change invalidates every session (§9/§10).
    await revokeAllSessions(record.userId, undefined, tx);
  });
  await logAudit({ actorId: record.userId, actorName: 'user', actorRole: 'customer', action: 'permission_changed', resource: 'auth', target: 'password_reset' });
}

export async function changePassword(input: ChangePasswordInput, ctx: RequestContext): Promise<void> {
  if (!ctx.principal) throw new AuthenticationError({ message: { ar: 'غير مسجل الدخول.', en: 'Not authenticated.' } });
  const user = ctx.principal.user;
  if (!user.passwordHash || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw new AuthenticationError({
      code: 'INVALID_CURRENT_PASSWORD',
      message: { ar: 'كلمة المرور الحالية غير صحيحة.', en: 'Current password is incorrect.' },
    });
  }
  const passwordHash = await hashPassword(input.newPassword);
  await db().transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, user.id));
    // Keep the current session, revoke all others.
    await revokeAllSessions(user.id, ctx.principal!.sessionId, tx);
  });
}

export async function listSessions(ctx: RequestContext) {
  if (!ctx.principal) throw new AuthenticationError({ message: { ar: 'غير مسجل الدخول.', en: 'Not authenticated.' } });
  const rows = await db()
    .select()
    .from(sessions)
    .where(eq(sessions.userId, ctx.principal.userId))
    .orderBy(desc(sessions.lastActiveAt));
  return rows
    .filter((r) => !r.revokedAt)
    .map((r) => ({
      id: r.id,
      device: r.device,
      deviceType: r.deviceType,
      browser: r.browser,
      approxLocation: r.approxLocation ?? undefined,
      lastActive: r.lastActiveAt.toISOString(),
      current: r.id === ctx.principal!.sessionId,
    }));
}

export async function revokeOtherSession(sessionId: string, ctx: RequestContext): Promise<void> {
  if (!ctx.principal) throw new AuthenticationError({ message: { ar: 'غير مسجل الدخول.', en: 'Not authenticated.' } });
  // Ownership check (§11): a user can only revoke THEIR OWN sessions.
  const [sess] = await db().select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!sess || sess.userId !== ctx.principal.userId) {
    throw new AuthenticationError({ code: 'SESSION_NOT_FOUND', message: { ar: 'الجلسة غير موجودة.', en: 'Session not found.' } });
  }
  await revokeSession(sessionId);
}

// ---- helpers ----

function invalidCredentials(): AuthenticationError {
  return new AuthenticationError({
    code: 'INVALID_CREDENTIALS',
    message: { ar: 'رقم الهاتف أو كلمة المرور غير صحيحة.', en: 'Invalid phone number or password.' },
  });
}

async function issuePhoneOtp(userId: string, phone?: string, email?: string | null): Promise<string> {
  const code = generateNumericOtp(6);
  await db().insert(verificationTokens).values({
    userId,
    purpose: 'phone_verification',
    tokenHash: hashToken(code),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });
  // Deliver out of band (fire-and-forget — never blocks or fails the request).
  if (phone) void sendSms(phone, otpSms(code));
  if (email) {
    const tpl = verificationEmail(code);
    void sendEmail({ to: email, subject: tpl.subject, html: tpl.html, text: tpl.text, userId, template: 'verification' });
  }
  return code;
}

async function issueEmailVerificationLink(userId: string, email: string, ctx: RequestContext): Promise<string> {
  const token = generateToken(32);
  await db().insert(verificationTokens).values({
    userId,
    purpose: 'email_verification',
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
  });
  
  const link = `${publicEnv().NEXT_PUBLIC_APP_URL}/verify?token=${token}`;
  const tpl = (await import('../../lib/email')).emailVerificationLinkEmail(link);
  void (await import('../../lib/email')).sendEmail({ to: email, subject: tpl.subject, html: tpl.html, text: tpl.text, userId, template: 'email_verification' });
  
  if (serverEnv().NODE_ENV !== 'production') {
    ctx.log.info({ verifyToken: '[issued]' }, 'email verification token issued (dev)');
  }
  return token;
}


async function recordLogin(
  userId: string | null,
  identifier: string,
  ctx: RequestContext,
  result: 'success' | 'failed',
): Promise<void> {
  const dev = ctx.deviceInfo();
  await db().insert(loginActivity).values({
    userId,
    identifier,
    device: dev.device,
    browser: dev.browser,
    ipAddress: ctx.ip,
    result,
  });
}

export async function verifyPhone(code: string, ctx: RequestContext): Promise<void> {
  if (!ctx.principal) throw new AuthenticationError({ message: { ar: 'غير مسجل الدخول.', en: 'Not authenticated.' } });
  const [record] = await db()
    .select()
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.userId, ctx.principal.userId),
        eq(verificationTokens.purpose, 'phone_verification'),
        eq(verificationTokens.tokenHash, hashToken(code)),
      ),
    )
    .limit(1);
  if (!record || record.consumedAt || record.expiresAt < new Date()) {
    throw new ValidationError({ code: 'INVALID_OTP', message: { ar: 'رمز التحقق غير صحيح أو منتهي.', en: 'Verification code is invalid or expired.' } });
  }
  await db().transaction(async (tx) => {
    await tx.update(users).set({ phoneVerified: true, status: 'active' }).where(eq(users.id, ctx.principal!.userId));
    await tx.update(verificationTokens).set({ consumedAt: new Date() }).where(eq(verificationTokens.id, record.id));
  });
}

/**
 * Account deletion (Google Play / App Store 5.1.1(v)). Orders and their append-only
 * history are financial records and must survive, so the user row is anonymized in
 * place (orders keep a valid FK) rather than hard-deleted; everything else that holds
 * PII or is account-scoped is purged, and every session/device is cut off.
 * Re-auth: password always; TOTP or recovery code additionally when 2FA is enabled.
 */
export async function deleteAccount(input: DeleteAccountInput, ctx: RequestContext): Promise<void> {
  if (!ctx.principal) throw new AuthenticationError({ message: { ar: 'غير مسجل الدخول.', en: 'Not authenticated.' } });
  const user = ctx.principal.user;

  if (!user.passwordHash || !(await verifyPassword(user.passwordHash, input.reauthPassword))) {
    throw new AuthenticationError({
      code: 'REAUTH_REQUIRED',
      message: { ar: 'كلمة المرور غير صحيحة.', en: 'Password confirmation is required for this action.' },
    });
  }

  if (user.twoFactorEnabled) {
    if (!input.code) {
      throw new AuthenticationError({
        code: 'TWO_FACTOR_REQUIRED',
        message: { ar: 'أدخل رمز التحقق بخطوتين لتأكيد حذف الحساب.', en: 'Enter your two-factor code to confirm account deletion.' },
      });
    }
    if (!(await checkTwoFactorCode(user.id, input.code))) {
      throw new AuthenticationError({
        code: 'INVALID_2FA_CODE',
        message: { ar: 'رمز التحقق غير صحيح.', en: 'Invalid verification code.' },
      });
    }
  }

  await db().transaction(async (tx) => {
    await tx.delete(addresses).where(eq(addresses.userId, user.id));
    await tx.delete(deviceTokens).where(eq(deviceTokens.userId, user.id));
    await tx.delete(wishlists).where(eq(wishlists.userId, user.id)); // items cascade
    await tx.delete(carts).where(eq(carts.userId, user.id)); // items cascade
    await tx.delete(mfaSecrets).where(eq(mfaSecrets.userId, user.id));
    await tx.delete(verificationTokens).where(eq(verificationTokens.userId, user.id));
    await tx.delete(notifications).where(eq(notifications.userId, user.id));
    await tx.delete(notificationPreferences).where(eq(notificationPreferences.userId, user.id));
    await tx.delete(profiles).where(eq(profiles.userId, user.id));
    // login_activity/email_events keep the phone/email used — purge rather than orphan.
    await tx.delete(loginActivity).where(eq(loginActivity.userId, user.id));
    await tx.delete(emailEvents).where(eq(emailEvents.userId, user.id));

    // The phone placeholder is derived from the immutable id so the (store, phone)
    // unique index can never collide, and the real number frees up for re-registration.
    await tx
      .update(users)
      .set({
        name: 'Deleted User',
        phone: `deleted:${user.id}`,
        email: null,
        passwordHash: null,
        avatar: null,
        defaultVillage: '',
        dateOfBirth: null,
        status: 'disabled',
        twoFactorEnabled: false,
        emailVerified: false,
        phoneVerified: false,
      })
      .where(eq(users.id, user.id));

    await revokeAllSessions(user.id, undefined, tx);
    // audit_logs is append-only, so the entry must not carry the real name.
    await logAudit(
      {
        actorId: user.id,
        actorName: 'deleted user',
        actorRole: user.isStaff ? 'staff' : 'customer',
        action: 'account_deleted',
        resource: 'auth',
        result: 'success',
        requestId: ctx.requestId,
        ipAddress: ctx.ip,
      },
      tx,
    );
  });

  ctx.clearCookie(SESSION_COOKIE);
  ctx.clearCookie(CSRF_COOKIE, { httpOnly: false });
}

export { loadPermissions };

/** Revoke all of the caller's OTHER sessions (logout everywhere else). */
export async function logoutOtherDevices(ctx: RequestContext): Promise<void> {
  if (!ctx.principal) throw new AuthenticationError({ message: { ar: 'غير مسجل الدخول.', en: 'Not authenticated.' } });
  await revokeAllSessions(ctx.principal.userId, ctx.principal.sessionId);
}

/** Recent login attempts for the caller (account security page). */
export async function getLoginActivity(ctx: RequestContext) {
  if (!ctx.principal) throw new AuthenticationError({ message: { ar: 'غير مسجل الدخول.', en: 'Not authenticated.' } });
  const rows = await db()
    .select()
    .from(loginActivity)
    .where(eq(loginActivity.userId, ctx.principal.userId))
    .orderBy(desc(loginActivity.createdAt))
    .limit(20);
  return rows.map((r) => ({
    id: r.id, device: r.device, browser: r.browser, approxLocation: r.approxLocation ?? undefined,
    timestamp: r.createdAt.toISOString(), result: r.result,
  }));
}

/** Update the caller's own profile (limited, self-service fields only). */
export async function updateProfile(ctx: RequestContext, patch: { name?: string; email?: string; defaultVillage?: string; avatar?: string; houseImage?: string; dateOfBirth?: string; preferredLanguage?: string }): Promise<User> {
  if (!ctx.principal) throw new AuthenticationError({ message: { ar: 'غير مسجل الدخول.', en: 'Not authenticated.' } });
  const [before] = await db().select({ avatar: users.avatar, houseImage: users.houseImage }).from(users).where(eq(users.id, ctx.principal.userId)).limit(1);
  const fields: Record<string, unknown> = {};
  if (patch.name !== undefined) fields.name = patch.name;
  if (patch.email !== undefined) fields.email = patch.email;
  if (patch.defaultVillage !== undefined) fields.defaultVillage = patch.defaultVillage;
  if (patch.avatar !== undefined) fields.avatar = patch.avatar;
  if (patch.houseImage !== undefined) fields.houseImage = patch.houseImage;
  if (patch.dateOfBirth !== undefined) fields.dateOfBirth = patch.dateOfBirth;
  if (patch.preferredLanguage !== undefined) fields.preferredLanguage = patch.preferredLanguage;
  if (Object.keys(fields).length) await db().update(users).set(fields).where(eq(users.id, ctx.principal.userId));
  const [row] = await db().select().from(users).where(eq(users.id, ctx.principal.userId)).limit(1);
  // Best-effort: the old photo is no longer referenced anywhere once replaced, so it
  // would otherwise sit in the bucket forever. Fire-and-forget — never block/fail the
  // profile update over storage cleanup.
  if (patch.avatar !== undefined && before?.avatar && before.avatar !== patch.avatar) void deleteObjectByUrl(before.avatar);
  if (patch.houseImage !== undefined && before?.houseImage && before.houseImage !== patch.houseImage) void deleteObjectByUrl(before.houseImage);
  return toUserDto(row!);
}

export async function verifyEmail(token: string, ctx: RequestContext): Promise<void> {
  const [record] = await db()
    .select()
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.purpose, 'email_verification'),
        eq(verificationTokens.tokenHash, hashToken(token)),
      ),
    )
    .limit(1);
    
  if (!record || record.consumedAt || record.expiresAt < new Date()) {
    throw new ValidationError({ code: 'INVALID_TOKEN', message: { ar: 'رابط التحقق غير صالح أو منتهي.', en: 'Verification link is invalid or expired.' } });
  }
  
  await db().transaction(async (tx) => {
    await tx.update(users).set({ emailVerified: true, status: 'active' }).where(eq(users.id, record.userId));
    await tx.update(verificationTokens).set({ consumedAt: new Date() }).where(eq(verificationTokens.id, record.id));
  });
}

export async function resendEmailVerification(email: string, ctx: RequestContext): Promise<void> {
  const [user] = await db().select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || user.emailVerified) return; // Anti-enumeration / No-op if already verified
  
  // Issue new token and send email
  await issueEmailVerificationLink(user.id, email, ctx);
}

export async function providerLogin(idToken: string, provider: 'google' | 'apple', ctx: RequestContext): Promise<User> {
  const adminAuth = (await import('../../lib/firebase-admin')).getFirebaseAuth();
  let decodedToken;
  try {
    decodedToken = await adminAuth.verifyIdToken(idToken);
  } catch (e) {
    throw new AuthenticationError({ code: 'INVALID_PROVIDER_TOKEN', message: { ar: 'فشل التحقق من مزود الخدمة.', en: 'Provider verification failed.' } });
  }

  const email = decodedToken.email;
  if (!email) {
    throw new ValidationError({ code: 'EMAIL_REQUIRED', message: { ar: 'تعذر الوصول للبريد الإلكتروني من الحساب.', en: 'Could not access email from account.' } });
  }

  // Check if user exists by email
  let [user] = await db().select().from(users).where(eq(users.email, email)).limit(1);

  if (user) {
    // Link account
    if (!user.emailVerified) {
      // Social login implicitly verifies email since provider verified it
      await db().update(users).set({ emailVerified: true, status: 'active' }).where(eq(users.id, user.id));
      user.emailVerified = true;
      user.status = 'active';
    }
  } else {
    // Create new user with a placeholder phone number
    const name = decodedToken.name || (email.split('@')[0]);
    user = await db().transaction(async (tx) => {
      const id = newId();
      const [row] = await tx
        .insert(users)
        .values({
          id,
          name,
          phone: `${provider}:${id}`, // Placeholder
          email,
          passwordHash: null,
          status: 'active',
          emailVerified: true,
          isStaff: false,
        })
        .returning();
      await tx.insert(profiles).values({ userId: row!.id }).onConflictDoNothing();
      await tx.insert(notificationPreferences).values({ userId: row!.id }).onConflictDoNothing();
      return row!;
    });
    
    await logAudit({
      actorId: user.id,
      actorName: user.name,
      actorRole: 'customer',
      action: 'user_created',
      resource: 'auth',
      result: 'success',
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
    });
  }

  await finishLogin(user, ctx, email);
  return toUserDto(user);
}
