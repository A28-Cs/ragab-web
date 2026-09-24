import { readiness } from '@ragab/server/modules/health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const result = await readiness();
  return new Response(JSON.stringify(result), { status: result.status === 'ok' ? 200 : 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
