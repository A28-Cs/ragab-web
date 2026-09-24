import { db } from './src/db/client';
import { orderStatusHistory, orders } from './src/db/schema/orders';
import { eq } from 'drizzle-orm';

async function main() {
  const [order] = await db().select().from(orders).where(eq(orders.orderNumber, 'MHS-F6BEKWMP'));
  if (!order) {
    console.log('Order not found');
    process.exit(0);
  }
  const history = await db().select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, order.id));
  console.log('Status History:', history.map(h => ({ from: h.fromStatus, to: h.toStatus, at: h.createdAt, kind: h.kind })));
  process.exit(0);
}
main();
