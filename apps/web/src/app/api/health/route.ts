import { liveness } from '@ragab/server/modules/health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return new Response(JSON.stringify(liveness()), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
