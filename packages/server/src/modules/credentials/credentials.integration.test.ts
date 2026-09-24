import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db, closeDb } from '../../db/client';
import { providerCredentials } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { setCredentials, listProviderStatus, getCredential, invalidateCredentialsCache } from './service';

const ctx = { requestId: 't', principal: { userId: 'u', user: { name: 'admin' } } } as any;
const SECRET = 'sk_live_supersecret_ABCD1234';

describe('provider credentials (integration, §33)', () => {
  beforeEach(async () => {
    await db().delete(providerCredentials).where(eq(providerCredentials.provider, 'paymob'));
    invalidateCredentialsCache();
  });
  afterAll(async () => {
    await db().delete(providerCredentials).where(eq(providerCredentials.provider, 'paymob'));
    await closeDb();
  });

  it('stores a secret ENCRYPTED and reads it back via getCredential (DB override)', async () => {
    await setCredentials(ctx, 'paymob', { PAYMOB_SECRET_KEY: SECRET });
    // The DB row is ciphertext, not the plaintext.
    const [row] = await db().select().from(providerCredentials).where(eq(providerCredentials.keyName, 'PAYMOB_SECRET_KEY')).limit(1);
    expect(row!.valueEncrypted).not.toContain(SECRET);
    expect(row!.valueEncrypted.split('.').length).toBe(4); // salt.iv.tag.cipher
    // getCredential decrypts and returns the real value.
    invalidateCredentialsCache();
    expect(await getCredential('paymob', 'PAYMOB_SECRET_KEY')).toBe(SECRET);
  });

  it('NEVER returns the full secret in the masked listing', async () => {
    await setCredentials(ctx, 'paymob', { PAYMOB_SECRET_KEY: SECRET });
    invalidateCredentialsCache();
    const list = await listProviderStatus();
    const json = JSON.stringify(list);
    expect(json).not.toContain(SECRET); // the full secret must not leak anywhere
    const paymob = list.find((p) => p.key === 'paymob')!;
    const key = paymob.keys.find((k) => k.name === 'PAYMOB_SECRET_KEY')!;
    expect(key.configured).toBe(true);
    expect(key.source).toBe('db');
    expect(key.masked).toBe('••••1234'); // only the last 4 chars
  });

  it('ignores an untouched masked value on save (no overwrite with the mask)', async () => {
    await setCredentials(ctx, 'paymob', { PAYMOB_SECRET_KEY: SECRET });
    invalidateCredentialsCache();
    // Re-saving the masked placeholder must NOT replace the real secret.
    await setCredentials(ctx, 'paymob', { PAYMOB_SECRET_KEY: '••••1234' });
    invalidateCredentialsCache();
    expect(await getCredential('paymob', 'PAYMOB_SECRET_KEY')).toBe(SECRET);
  });
});
