import { NextRequest } from 'next/server';
import { createSubscriber } from '@ragab/server/lib/events';
import { buildContext } from '@ragab/server/http/context';
import { hasAnyAdminAccess } from '@ragab/server/security/permissions';
import { logger } from '@ragab/server/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // 1. Authorization: Ensure only Admins/Dispatchers can connect
  const ctx = await buildContext(req);
  const session = ctx.principal;
  if (!session || !hasAnyAdminAccess(session.permissions)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const encoder = new TextEncoder();
  
  const customReadable = new ReadableStream({
    async start(controller) {
      const subscriber = createSubscriber();

      // Send initial connection payload
      controller.enqueue(encoder.encode(`event: connected\ndata: {"status":"connected"}\n\n`));

      const channelName = 'topic:admin_orders';
      await subscriber.subscribe(channelName);

      // Listen for messages from Redis and pipe them to the SSE stream
      subscriber.on('message', (channel, message) => {
        if (channel === channelName) {
          try {
            const parsed = JSON.parse(message);
            const sseFormattedMessage = `event: ${parsed.event}\ndata: ${message}\n\n`;
            controller.enqueue(encoder.encode(sseFormattedMessage));
          } catch (err) {
            logger().error({ err }, 'Failed to parse/forward SSE message');
          }
        }
      });

      // Cleanup when the client disconnects
      req.signal.addEventListener('abort', () => {
        logger().debug('SSE client disconnected, closing subscriber');
        subscriber.quit();
        controller.close();
      });
    },
  });

  return new Response(customReadable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', 
    },
  });
}
