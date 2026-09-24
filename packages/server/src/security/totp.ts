/**
 * TOTP (2FA) wrapper over otplib (§9 optional 2FA). Generates the shared secret and the
 * otpauth:// URI (for authenticator apps / QR), and verifies 6-digit codes with a small
 * window to tolerate clock drift. Recovery codes are one-time, stored hashed.
 */
import { authenticator } from 'otplib';
import { randomBytes, createHash } from 'node:crypto';

authenticator.options = { window: 1 }; // accept the adjacent 30s step for drift

const ISSUER = 'Ragab';

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function totpAuthUri(secret: string, accountName: string): string {
  return authenticator.keyuri(accountName, ISSUER, secret);
}

export function verifyTotp(secret: string, token: string): boolean {
  try {
    return authenticator.verify({ token: token.trim(), secret });
  } catch {
    return false;
  }
}

/** Generate N single-use recovery codes and their SHA-256 hashes (store the hashes). */
export function generateRecoveryCodes(count = 8): { codes: string[]; hashes: string[] } {
  const codes: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = randomBytes(5).toString('hex').toUpperCase(); // 10 hex chars
    const code = `${raw.slice(0, 5)}-${raw.slice(5)}`;
    codes.push(code);
    hashes.push(createHash('sha256').update(code).digest('hex'));
  }
  return { codes, hashes };
}

export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}
