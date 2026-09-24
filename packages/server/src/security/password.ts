/**
 * Password hashing (§9). Argon2id with OWASP-recommended parameters via `hash-wasm`
 * (pure WASM — works on every Node runtime including Vercel serverless, unlike the
 * native `@node-rs/argon2` whose platform-specific `.node` binaries the Next tracer
 * strips out of the deployed function).
 *
 * The output is standard PHC-format (`$argon2id$v=19$m=…,t=…,p=…$salt$hash`) so hashes
 * produced here are byte-compatible with any other Argon2id implementation — existing
 * hashes stored by the old native library keep verifying, and new hashes will still
 * verify if we ever switch back.
 */
import { randomBytes } from 'node:crypto';
import { argon2id, argon2Verify } from 'hash-wasm';

const OPTIONS = {
  memorySize: 19456, // 19 MiB (Argon2id OWASP profile)
  iterations: 2,
  parallelism: 1,
  hashLength: 32,
  saltLength: 16,
} as const;

async function hashArgon2id(plain: string): Promise<string> {
  return argon2id({
    password: plain,
    salt: randomBytes(OPTIONS.saltLength),
    iterations: OPTIONS.iterations,
    memorySize: OPTIONS.memorySize,
    parallelism: OPTIONS.parallelism,
    hashLength: OPTIONS.hashLength,
    outputType: 'encoded',
  });
}

/** A REAL argon2 hash of a random value, computed once, to burn equal time on unknown users. */
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) dummyHashPromise = hashArgon2id('ragab-timing-pad');
  return dummyHashPromise;
}

export async function hashPassword(plain: string): Promise<string> {
  return hashArgon2id(plain);
}

export async function verifyPassword(hashString: string, plain: string): Promise<boolean> {
  try {
    return await argon2Verify({ password: plain, hash: hashString });
  } catch {
    return false;
  }
}

/** Burn comparable time on a non-existent account so responses don't leak existence. */
export async function dummyVerify(plain: string): Promise<void> {
  try {
    await argon2Verify({ password: plain, hash: await getDummyHash() });
  } catch {
    /* ignore — this is timing padding only */
  }
}

/** Baseline password policy (§14). The route schema also enforces this via Zod. */
export function isStrongPassword(plain: string): boolean {
  return typeof plain === 'string' && plain.length >= 8 && plain.length <= 200;
}
