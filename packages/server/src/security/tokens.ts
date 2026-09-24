/**
 * Opaque token primitives (§10). Session and verification tokens are 256-bit random
 * values. We store only their SHA-256 hash, so a DB leak cannot resurrect a live
 * session or reset link. Comparison of a presented token is by hashing then equality
 * on the indexed column — the DB lookup is the constant-time-enough comparison.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Generate a URL-safe opaque token (default 32 bytes = 256 bits of entropy). */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** SHA-256 hex of a token — what we persist and index on. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Numeric OTP for phone verification (§9). Zero-padded to `digits`. */
export function generateNumericOtp(digits = 6): string {
  const max = 10 ** digits;
  const n = randomBytes(4).readUInt32BE(0) % max;
  return n.toString().padStart(digits, '0');
}

/** Constant-time string comparison for secrets compared in-process (e.g. CSRF). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
