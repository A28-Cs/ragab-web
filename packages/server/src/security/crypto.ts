/**
 * Envelope encryption for secrets at rest (§9 — 2FA secrets). AES-256-GCM with a key
 * derived from SESSION_SECRET via scrypt. Not a KMS, but keeps TOTP secrets from being
 * readable in a raw DB dump. Format: base64(salt).base64(iv).base64(tag).base64(cipher).
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { serverEnv } from '../config/env';

function deriveKey(salt: Buffer): Buffer {
  return scryptSync(serverEnv().SESSION_SECRET, salt, 32);
}

export function encryptSecret(plaintext: string): string {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [salt, iv, tag, enc].map((b) => b.toString('base64')).join('.');
}

export function decryptSecret(payload: string): string {
  const [salt, iv, tag, enc] = payload.split('.').map((p) => Buffer.from(p, 'base64'));
  if (!salt || !iv || !tag || !enc) throw new Error('malformed ciphertext');
  const key = deriveKey(salt);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
