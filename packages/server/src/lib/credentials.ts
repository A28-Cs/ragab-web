/**
 * Low-level credential reader (§33). Lives in `lib` so any layer (providers, email,
 * storage) can read effective credentials without importing a module. A DB value
 * (encrypted) OVERRIDES the matching process env var. Cached briefly to avoid decrypting
 * on every call. The admin module owns the WRITE side + registry + masking.
 */
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { providerCredentials } from '../db/schema';
import { DEFAULT_STORE_ID } from '../db/schema/system';
import { decryptSecret } from '../security/crypto';

let cache: Map<string, string> | null = null;
let cacheAt = 0;
const TTL_MS = 30_000;

export async function loadDbCredentials(): Promise<Map<string, string>> {
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;
  const rows = await db().select().from(providerCredentials).where(eq(providerCredentials.storeId, DEFAULT_STORE_ID));
  const map = new Map<string, string>();
  for (const r of rows) {
    try {
      map.set(`${r.provider}:${r.keyName}`, decryptSecret(r.valueEncrypted));
    } catch {
      /* skip an undecryptable row */
    }
  }
  cache = map;
  cacheAt = Date.now();
  return map;
}

/** Read a credential: DB override first, then the process env var. */
export async function getCredential(provider: string, keyName: string): Promise<string | undefined> {
  const map = await loadDbCredentials();
  const dbVal = map.get(`${provider}:${keyName}`);
  if (dbVal !== undefined && dbVal !== '') return dbVal;
  const envVal = process.env[keyName];
  return envVal && envVal !== '' ? envVal : undefined;
}

export function invalidateCredentialsCache(): void {
  cache = null;
}
