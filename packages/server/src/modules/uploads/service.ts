/**
 * Secure image upload (§31). Accepts raw image bytes, then:
 *   - caps size (5 MB) on the RAW upload — before any processing, so a decompression
 *     bomb never reaches sharp
 *   - sniffs the ACTUAL content type from magic bytes (file-type) — never trusts the
 *     client's Content-Type or filename
 *   - allows only jpeg/png/webp
 *   - re-encodes to WebP: auto-rotated from EXIF orientation then EXIF stripped (no GPS/
 *     device metadata leaves in the file), downscaled to fit within 1600×1600 (never
 *     upscaled), quality 82 — cuts a typical phone photo from several MB to well under 500 KB
 *     without a visible quality loss, and keeps every stored image the same normalized
 *     shape regardless of what the client originally sent
 *   - generates a random storage key (no user-controlled path → no path traversal), unless
 *     the caller supplies a deterministic one — see `explicitKey` below
 *   - uploads to object storage and returns the public URL
 * Requires a permission at the route. Serving from a separate origin with attachment
 * disposition is handled by bucket config.
 */
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { BusinessRuleError, ValidationError } from '../../lib/errors';
import { prefixedId } from '../../lib/ids';
import { putObject } from '../../lib/storage';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_DIMENSION = 1600;
const WEBP_QUALITY = 82;
const OUTPUT_MIME = 'image/webp';

/**
 * A caller-supplied key stem (no extension — every upload is re-encoded to WebP, so the
 * extension is always `.webp` regardless of what was sent). Kept intentionally narrow:
 * lowercase ASCII, digits, `/ _ -`, no `..` — so an EAN-derived key like `6224010081116` is
 * fine but nothing resembling a path-traversal or a control character gets anywhere near the
 * storage call. The random-key default exists specifically to keep user-uploaded filenames out
 * of the key; this regex is what keeps that guarantee even when a caller opts into a
 * deterministic one (the catalog importer, so a re-run overwrites the same object instead of
 * uploading a duplicate every time).
 */
const SAFE_KEY_STEM = /^[a-z0-9][a-z0-9/_-]{0,180}$/;

export async function uploadImage(
  bytes: Buffer,
  keyPrefix = 'products',
  explicitKey?: string,
): Promise<{ url: string; contentType: string; size: number }> {
  if (!bytes || bytes.length === 0) throw new ValidationError({ code: 'EMPTY_UPLOAD', message: { ar: 'لم يتم إرسال ملف.', en: 'No file was uploaded.' } });
  if (bytes.length > MAX_BYTES) {
    throw new BusinessRuleError({ code: 'FILE_TOO_LARGE', message: { ar: 'حجم الملف كبير جداً (الحد 5 ميجابايت).', en: 'File too large (max 5 MB).' } });
  }
  if (explicitKey !== undefined && (!SAFE_KEY_STEM.test(explicitKey) || explicitKey.includes('..'))) {
    throw new ValidationError({ code: 'INVALID_STORAGE_KEY', message: { ar: 'مفتاح تخزين غير صالح.', en: 'Invalid storage key.' } });
  }
  // Magic-byte sniff — the authoritative content type. Runs BEFORE sharp ever touches the
  // bytes, so an arbitrary file with a spoofed extension never reaches the image decoder.
  const detected = await fileTypeFromBuffer(bytes);
  if (!detected || !ALLOWED.has(detected.mime)) {
    throw new BusinessRuleError({ code: 'UNSUPPORTED_FILE_TYPE', message: { ar: 'نوع الملف غير مدعوم. الصور فقط (JPG/PNG/WebP).', en: 'Unsupported file type. Images only (JPG/PNG/WebP).' } });
  }

  let output: Buffer;
  try {
    output = await sharp(bytes)
      .rotate() // apply EXIF orientation, then metadata (incl. GPS) is dropped by default
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch {
    // A file that passed the magic-byte sniff but isn't a decodable image (truncated,
    // malformed) — reject cleanly instead of a raw 500.
    throw new BusinessRuleError({ code: 'UNSUPPORTED_FILE_TYPE', message: { ar: 'تعذّرت معالجة الصورة. جرّب ملفاً آخر.', en: 'Could not process this image. Try a different file.' } });
  }

  const stem = explicitKey ?? prefixedId('img');
  const key = `${keyPrefix}/${stem}.webp`;
  const url = await putObject(key, output, OUTPUT_MIME);
  return { url, contentType: OUTPUT_MIME, size: output.length };
}
