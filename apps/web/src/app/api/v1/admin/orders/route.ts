import { defineRoute } from '@ragab/server';
import { orderService, orderListSchema } from '@ragab/server/modules/orders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  method: 'GET',
  permission: { resource: 'orders', action: 'view' },
  querySchema: orderListSchema,
  handler: ({ query, ctx }) => orderService.listAllOrders(ctx, query),
});

// Manual (hand-typed) orders were removed at the owner's request: a grocery store takes
// orders through the storefront and the app only. `orderService.createManualOrder`
// remains for a future POS integration but is no longer exposed over HTTP.
