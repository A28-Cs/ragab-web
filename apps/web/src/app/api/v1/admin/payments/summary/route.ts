import { defineRoute } from '@ragab/server';
import { reportService } from '@ragab/server/modules/reports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Captured / refunded / net for the Payments page. Computed server-side from
 * `amount_minor` and `refunded_minor` (not from row status), so a fully refunded payment
 * counts in gross AND in refunds and net can never go negative.
 */
export const GET = defineRoute({
  method: 'GET',
  permission: { resource: 'payments', action: 'view' },
  handler: () => reportService.collectedTotals(),
});
