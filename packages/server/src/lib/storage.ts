/**
 * Object storage (§31). S3-compatible (AWS S3 or MinIO). Path-style addressing for MinIO.
 * Lazy client so importing this module never opens a connection. Only presence of the
 * credentials enables real uploads; otherwise callers get a clear "not configured" error.
 */
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { serverEnv } from '../config/env';
import { getCredential } from './credentials';
import { ExternalServiceError } from './errors';
import { logger } from './logger';

/** Build an S3 client from the EFFECTIVE credentials (DB override or env), or null. */
async function getClient(): Promise<S3Client | null> {
  const accessKeyId = await getCredential('s3', 'S3_ACCESS_KEY_ID');
  const secretAccessKey = await getCredential('s3', 'S3_SECRET_ACCESS_KEY');
  if (!accessKeyId || !secretAccessKey) return null;
  const endpoint = await getCredential('s3', 'S3_ENDPOINT');
  const region = (await getCredential('s3', 'S3_REGION')) ?? serverEnv().S3_REGION;
  return new S3Client({ region, endpoint: endpoint || undefined, forcePathStyle: Boolean(endpoint), credentials: { accessKeyId, secretAccessKey } });
}

export async function storageConfigured(): Promise<boolean> {
  return (await getClient()) !== null;
}

/** Upload bytes under `key`, returning the public URL. `Content-Disposition: attachment`
 *  and no-execute are applied by the bucket policy / a separate serving origin (§31). */
export async function putObject(key: string, body: Buffer, contentType: string): Promise<string> {
  const c = await getClient();
  const env = serverEnv();
  if (!c) throw new ExternalServiceError({ code: 'STORAGE_NOT_CONFIGURED', message: { ar: 'التخزين غير مهيأ.', en: 'Object storage is not configured.' } });
  const bucket = (await getCredential('s3', 'S3_BUCKET')) ?? env.S3_BUCKET;
  await c.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );
  const publicUrl = (await getCredential('s3', 'S3_PUBLIC_URL')) ?? env.S3_PUBLIC_URL;
  const endpoint = (await getCredential('s3', 'S3_ENDPOINT')) ?? env.S3_ENDPOINT;
  const base = publicUrl ?? `${endpoint}/${bucket}`;
  return `${base.replace(/\/$/, '')}/${key}`;
}

/**
 * Best-effort delete of a previously uploaded object, given its public URL. Used when a
 * replaced image (product/category photo, house photo) makes the old object unreachable —
 * otherwise every edit leaks storage forever, since nothing else ever references the old
 * key. Silently no-ops for URLs that aren't ours (seeded/external images like Unsplash) or
 * when storage isn't configured, and never throws — a stray orphaned file is a much smaller
 * problem than failing the caller's actual request over cleanup.
 */
export async function deleteObjectByUrl(url: string | null | undefined): Promise<void> {
  if (!url) return;
  try {
    const c = await getClient();
    if (!c) return;
    const env = serverEnv();
    const bucket = (await getCredential('s3', 'S3_BUCKET')) ?? env.S3_BUCKET;
    const publicUrl = (await getCredential('s3', 'S3_PUBLIC_URL')) ?? env.S3_PUBLIC_URL;
    const endpoint = (await getCredential('s3', 'S3_ENDPOINT')) ?? env.S3_ENDPOINT;
    const base = (publicUrl ?? (endpoint ? `${endpoint}/${bucket}` : undefined))?.replace(/\/$/, '');
    if (!base || !url.startsWith(`${base}/`)) return;
    const key = url.slice(base.length + 1).split(/[?#]/)[0];
    if (!key) return;
    await c.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err) {
    logger().warn({ err, url }, 'failed to delete replaced storage object');
  }
}
