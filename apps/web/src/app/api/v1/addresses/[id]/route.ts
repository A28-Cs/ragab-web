import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { addressService, addressSchema } from '@ragab/server/modules/addresses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const p = z.object({ id: z.string().min(1).max(64) });
export const PUT = defineRoute({ method: 'PUT', auth: 'required', paramsSchema: p, bodySchema: addressSchema, handler: ({ params, body, ctx }) => addressService.updateAddress(ctx, params.id, body) });
export const DELETE = defineRoute({ method: 'DELETE', auth: 'required', paramsSchema: p, handler: async ({ params, ctx }) => { await addressService.deleteAddress(ctx, params.id); return { ok: true }; } });
