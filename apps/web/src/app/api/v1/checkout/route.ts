import { defineRoute, RATE_RULES } from '@ragab/server';
import { checkoutService, checkoutSchema } from '@ragab/server/modules/checkout';
import { paymentService } from '@ragab/server/modules/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  method: 'POST',
  auth: 'required',
  rateLimit: RATE_RULES.checkout,
  idempotent: { scope: 'checkout' },
  bodySchema: checkoutSchema,
  successStatus: 201,
  handler: async ({ body, ctx }) => {
    const order = await checkoutService.placeOrder(ctx, body);
    // Payment init happens AFTER the order transaction committed (§22).
    const payment = await paymentService.initPayment(order.id);
    return { order, payment };
  },
});
