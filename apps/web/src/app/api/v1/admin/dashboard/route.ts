import { defineRoute } from '@ragab/server';
import { dashboardOverview } from '@ragab/server/modules/reports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The service enforces staff access and each metric's existing resource permission.
export const GET = defineRoute({
  method: 'GET',
  auth: 'required',
  handler: ({ ctx }) => dashboardOverview(ctx),
});