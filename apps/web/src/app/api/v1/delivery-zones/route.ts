import { defineRoute, RATE_RULES } from '@ragab/server';
import { listDeliveryZones } from '@ragab/server/modules/shipping';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({ method: 'GET', auth: 'none', rateLimit: RATE_RULES.readApi, handler: () => listDeliveryZones() });
