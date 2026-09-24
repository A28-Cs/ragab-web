import { defineRoute } from '@ragab/server';
import { uploadImage } from '@ragab/server/modules/uploads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Raw image bytes in the body; the server sniffs the real type from magic bytes (§31).
export const POST = defineRoute({
  method: 'POST',
  permission: { resource: 'products', action: 'edit' },
  rawBody: true,
  handler: ({ rawBody }) => uploadImage(rawBody ?? Buffer.alloc(0)),
});
