import { defineRoute } from '@ragab/server';
import { addressService, addressSchema } from '@ragab/server/modules/addresses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({ method: 'GET', auth: 'required', handler: ({ ctx }) => addressService.listAddresses(ctx) });
export const POST = defineRoute({ method: 'POST', auth: 'required', bodySchema: addressSchema, successStatus: 201, handler: ({ body, ctx }) => addressService.createAddress(ctx, body) });
