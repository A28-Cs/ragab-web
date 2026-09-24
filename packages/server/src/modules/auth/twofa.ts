/**
 * Two-factor authentication (§9). TOTP-based, with one-time recovery codes.
 *
 * Enrollment: setup() mints a secret (stored encrypted, unconfirmed) and returns the
 * otpauth URI for the authenticator app. enable() verifies a code, confirms the secret,
 * flips users.twoFactorEnabled, and returns recovery codes ONCE.
 *
 * Login: when a 2FA user logs in with the right password, login() does NOT establish a
 * session — it returns a short-lived signed CHALLENGE. The client submits the TOTP (or a
 * recovery code) to verifyLoginTwoFactor(), which then establishes the session. The
 * challenge is an HMAC over userId+expiry, so no server state is needed for it.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { RequestContext } from '../../http/context';
import { db } from '../../db/client';
import { users, mfaSecrets } from '../../db/schema';
import { AuthenticationError, BusinessRuleError, ConflictError, NotFoundError } from '../../lib/errors';
import { serverEnv } from '../../config/env';
import { encryptSecret, decryptSecret } from '../../security/crypto';
import { generateTotpSecret, totpAuthUri, verifyTotp, generateRecoveryCodes, hashRecoveryCode } from '../../security/totp';
import { verifyPassword } from '../../security/password';
import { logAudit } from '../audit';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

// ---- login challenge (stateless, signed) ----

export function issueLoginChallenge(userId: string): string {
  const exp = Date.now() + CHALLENGE_TTL_MS;
  const payload = `${userId}.${exp}`;
  const sig = createHmac('sha256', serverEnv().SESSION_SECRET).update(`2fa:${payload}`).digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

export function verifyLoginChallenge(token: string): string | null {
  const [b64, sig] = token.split('.');
  if (!b64 || !sig) return null;
  const payload = Buffer.from(b64, 'base64url').toString('utf8');
  const expected = createHmac('sha256', serverEnv().SESSION_SECRET).update(`2fa:${payload}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [userId, expStr] = payload.split('.');
  if (!userId || !expStr || Date.now() > Number(expStr)) return null;
  return userId;
}

// ---- enrollment ----

export async function setupTwoFactor(ctx: RequestContext): Promise<{ secret: string; otpauthUri: string }> {
  const user = requireUser(ctx);
  if (user.twoFactorEnabled) {
    throw new ConflictError({ code: 'TWO_FACTOR_ALREADY_ENABLED', message: { ar: 'التحقق بخطوتين مفعّل بالفعل.', en: 'Two-factor is already enabled.' } });
  }
  const secret = generateTotpSecret();
  const encrypted = encryptSecret(secret);
  await db()
    .insert(mfaSecrets)
    .values({ userId: user.id, secretEncrypted: encrypted, confirmedAt: null })
    .onConflictDoUpdate({ target: mfaSecrets.userId, set: { secretEncrypted: encrypted, confirmedAt: null, recoveryCodesHashed: null } });
  return { secret, otpauthUri: totpAuthUri(secret, user.email || user.phone) };
}

export async function enableTwoFactor(ctx: RequestContext, code: string): Promise<{ recoveryCodes: string[] }> {
  const user = requireUser(ctx);
  const [record] = await db().select().from(mfaSecrets).where(eq(mfaSecrets.userId, user.id)).limit(1);
  if (!record) throw new BusinessRuleError({ code: 'TWO_FACTOR_NOT_SETUP', message: { ar: 'ابدأ إعداد التحقق بخطوتين أولاً.', en: 'Start 2FA setup first.' } });
  const secret = decryptSecret(record.secretEncrypted);
  if (!verifyTotp(secret, code)) {
    throw new AuthenticationError({ code: 'INVALID_2FA_CODE', message: { ar: 'رمز التحقق غير صحيح.', en: 'Invalid verification code.' } });
  }
  const { codes, hashes } = generateRecoveryCodes(8);
  await db().transaction(async (tx) => {
    await tx.update(mfaSecrets).set({ confirmedAt: new Date(), recoveryCodesHashed: hashes }).where(eq(mfaSecrets.userId, user.id));
    await tx.update(users).set({ twoFactorEnabled: true }).where(eq(users.id, user.id));
  });
  await logAudit({ actorId: user.id, actorName: user.name, actorRole: user.isStaff ? 'staff' : 'customer', action: 'permission_changed', resource: 'auth', target: '2fa_enabled', requestId: ctx.requestId });
  return { recoveryCodes: codes };
}

export async function disableTwoFactor(ctx: RequestContext, password: string): Promise<void> {
  const user = requireUser(ctx);
  if (!user.passwordHash || !(await verifyPassword(user.passwordHash, password))) {
    throw new AuthenticationError({ code: 'INVALID_CURRENT_PASSWORD', message: { ar: 'كلمة المرور غير صحيحة.', en: 'Password is incorrect.' } });
  }
  await db().transaction(async (tx) => {
    await tx.delete(mfaSecrets).where(eq(mfaSecrets.userId, user.id));
    await tx.update(users).set({ twoFactorEnabled: false }).where(eq(users.id, user.id));
  });
  await logAudit({ actorId: user.id, actorName: user.name, actorRole: user.isStaff ? 'staff' : 'customer', action: 'permission_changed', resource: 'auth', target: '2fa_disabled', requestId: ctx.requestId });
}

// ---- login step ----

/** Verify a TOTP or recovery code for a user during login. Consumes a used recovery code. */
export async function checkTwoFactorCode(userId: string, code: string): Promise<boolean> {
  const [record] = await db().select().from(mfaSecrets).where(and(eq(mfaSecrets.userId, userId))).limit(1);
  if (!record || !record.confirmedAt) return false;
  const secret = decryptSecret(record.secretEncrypted);
  if (verifyTotp(secret, code)) return true;

  // Fall back to a one-time recovery code.
  const hashed = hashRecoveryCode(code);
  const remaining = record.recoveryCodesHashed ?? [];
  if (remaining.includes(hashed)) {
    await db().update(mfaSecrets).set({ recoveryCodesHashed: remaining.filter((h) => h !== hashed) }).where(eq(mfaSecrets.userId, userId));
    return true;
  }
  return false;
}

function requireUser(ctx: RequestContext) {
  if (!ctx.principal) throw new NotFoundError({ code: 'UNAUTHENTICATED', message: { ar: 'غير مسجل الدخول.', en: 'Not authenticated.' } });
  return ctx.principal.user;
}
