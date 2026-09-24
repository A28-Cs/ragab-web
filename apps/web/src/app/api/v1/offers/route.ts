import { defineRoute, RATE_RULES } from '@ragab/server';
import { listActiveOffers } from '@ragab/server/modules/offers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({ method: 'GET', auth: 'none', rateLimit: RATE_RULES.readApi, handler: () => listActiveOffers() });
