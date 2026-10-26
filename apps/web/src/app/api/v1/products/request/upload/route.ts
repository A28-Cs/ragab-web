import { defineRoute, RATE_RULES } from '@ragab/server';
import { uploadImage } from '@ragab/server/modules/uploads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  method: 'POST',
  auth: 'optional',
  csrf: false,
  rawBody: true,
  rateLimit: RATE_RULES.imageUpload,
  handler: ({ rawBody }) => uploadImage(rawBody ?? Buffer.alloc(0), 'product-requests'),
});
