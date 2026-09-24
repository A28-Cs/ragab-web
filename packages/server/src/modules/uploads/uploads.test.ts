import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';
import { uploadImage } from './service';

const putObject = vi.fn(async (key: string, _body: Buffer, _contentType: string) => `https://cdn.test/${key}`);
vi.mock('../../lib/storage', () => ({ putObject: (...args: [string, Buffer, string]) => putObject(...args) }));

describe('secure image upload validation (§31)', () => {
  it('rejects an empty upload', async () => {
    await expect(uploadImage(Buffer.alloc(0))).rejects.toMatchObject({ code: 'EMPTY_UPLOAD' });
  });

  it('rejects a non-image by MAGIC BYTES, not the claimed type', async () => {
    // Plain text bytes — no image magic number, so file-type detects nothing.
    const text = Buffer.from('<script>alert(1)</script> not an image', 'utf8');
    await expect(uploadImage(text)).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE' });
  });

  it('rejects a disguised executable (PE header) even if named .png upstream', async () => {
    const pe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]); // "MZ" DOS header
    await expect(uploadImage(pe)).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE' });
  });

  it('rejects an oversized file before sniffing', async () => {
    const big = Buffer.alloc(6 * 1024 * 1024, 1);
    await expect(uploadImage(big)).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
  });

  it('downscales an oversized image and re-encodes it to WebP', async () => {
    putObject.mockClear();
    const oversized = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 100, g: 150, b: 200 } } })
      .jpeg()
      .toBuffer();

    const result = await uploadImage(oversized, 'products');

    expect(result.contentType).toBe('image/webp');
    expect(putObject).toHaveBeenCalledTimes(1);
    const [key, storedBytes, storedContentType] = putObject.mock.calls[0]!;
    expect(key).toMatch(/^products\/.+\.webp$/);
    expect(storedContentType).toBe('image/webp');
    const meta = await sharp(storedBytes).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBeLessThanOrEqual(1600);
    expect(meta.height).toBeLessThanOrEqual(1600);
    // The original was a flat 3000x2000 JPEG (~a few KB synthetic, but the point holds on
    // real photos too): re-encoding at 1600px WebP never balloons past the original.
    expect(storedBytes.length).toBeLessThan(oversized.length);
  });

  it('never upscales an image smaller than the cap', async () => {
    putObject.mockClear();
    const small = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 10, g: 20, b: 30 } } })
      .png()
      .toBuffer();

    await uploadImage(small, 'house-photos');

    const [, storedBytes] = putObject.mock.calls[0]!;
    const meta = await sharp(storedBytes).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(300);
  });

  it('rejects bytes that pass the magic-byte sniff but are not a decodable image', async () => {
    // Valid JPEG magic number (FF D8 FF) followed by garbage — file-type is fooled by the
    // header, but sharp's decoder is not.
    const truncated = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 0)]);
    await expect(uploadImage(truncated)).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE' });
  });

  // §catalog import: the importer passes a deterministic key (the product's EAN) so a re-run
  // overwrites the same object instead of uploading a duplicate every time — the random-key
  // default exists to keep USER-uploaded filenames out of the key, not to forbid a caller from
  // opting into a safe, caller-controlled one. These reject before the (expensive, and here
  // storage-touching) magic-byte sniff, so they need no real object storage configured.
  describe('explicit storage key (catalog import)', () => {
    const junk = Buffer.from('not an image', 'utf8');

    it('rejects a key containing ..', async () => {
      await expect(uploadImage(junk, 'products', '../../etc/passwd')).rejects.toMatchObject({
        code: 'INVALID_STORAGE_KEY',
      });
    });

    it('rejects a key with uppercase or disallowed characters', async () => {
      await expect(uploadImage(junk, 'products', 'Bad Key!')).rejects.toMatchObject({
        code: 'INVALID_STORAGE_KEY',
      });
    });

    it('rejects an empty explicit key', async () => {
      await expect(uploadImage(junk, 'products', '')).rejects.toMatchObject({
        code: 'INVALID_STORAGE_KEY',
      });
    });

    it('accepts an EAN-shaped key and proceeds past key validation to the type sniff', async () => {
      // Proves the key itself was accepted: the rejection that DOES surface is the next
      // check in line (unsupported file type on non-image bytes), not INVALID_STORAGE_KEY.
      await expect(uploadImage(junk, 'products', '6224010081116')).rejects.toMatchObject({
        code: 'UNSUPPORTED_FILE_TYPE',
      });
    });

    it('uses the explicit key as the storage stem, with a .webp extension', async () => {
      putObject.mockClear();
      const png = await sharp({ create: { width: 200, height: 200, channels: 3, background: { r: 5, g: 5, b: 5 } } })
        .png()
        .toBuffer();

      await uploadImage(png, 'products', '6224010081116');

      const [key] = putObject.mock.calls[0]!;
      expect(key).toBe('products/6224010081116.webp');
    });
  });
});
