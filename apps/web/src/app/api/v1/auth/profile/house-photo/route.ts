import { defineRoute, RATE_RULES } from '@ragab/server';
import { uploadImage } from '@ragab/server/modules/uploads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Raw image bytes in the body; the server sniffs the real type from magic bytes (§31).
// Any authenticated customer may upload a photo of their own house — the URL still has
// to be PATCHed onto their profile via /auth/profile to actually take effect.
// Rate-limited well below the generic authenticated default: this is a 5 MB upload
// endpoint, not a read, and the default would let one account storage-bomb the bucket.
export const POST = defineRoute({
  method: 'POST',
  auth: 'required',
  rawBody: true,
  rateLimit: RATE_RULES.imageUpload,
  handler: ({ rawBody }) => uploadImage(rawBody ?? Buffer.alloc(0), 'house-photos'),
});
