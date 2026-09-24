import { handleEngeznyWebhook, syncOrderWithEngezny } from '@ragab/server/modules/orders';
import { buildContext } from '@ragab/server/http/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-engezny-signature',
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const signature = req.headers.get('x-engezny-signature') || '';

  // Try parsing JSON to check if it's a simple sync request from Engezny frontend
  try {
    const parsed = JSON.parse(rawBody);
    if (parsed.order_id && !parsed.event_type) {
      await syncOrderWithEngezny(parsed.order_id);
      return new Response(JSON.stringify({ success: true, synced: true }), {
        status: 200,
        headers: { 'content-type': 'application/json', ...corsHeaders },
      });
    }
  } catch {
    // proceed to standard webhook handler
  }

  const ctx = await buildContext(req);
  const result = await handleEngeznyWebhook(ctx, rawBody, signature);
  
  if (!result.success) {
    return new Response(JSON.stringify({ success: false, reason: result.reason }), {
      status: 400,
      headers: { 'content-type': 'application/json', ...corsHeaders },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'content-type': 'application/json', ...corsHeaders },
  });
}

