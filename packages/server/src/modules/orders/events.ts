import { desc, eq, or, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { auditLogs, orderStatusHistory, shipmentEvents, shipments } from '../../db/schema';
import type { OrderEventDto, ReasonCode } from '../../types';
import { prefixedId } from '../../lib/ids';

/**
 * Normalizes event types to standard dot-notated event names.
 */
function normalizeEventType(raw: string, kind?: string): string {
  if (raw.includes('.')) return raw;
  if (kind === 'payment') {
    return raw === 'paid' ? 'payment.succeeded' : raw === 'failed' ? 'payment.failed' : `payment.${raw}`;
  }
  if (kind === 'fulfillment') {
    return `delivery.${raw}`;
  }
  return `order.${raw}`;
}

/**
 * Retrieves the full unified event timeline for an order, merging
 * order status history, delivery/shipment events, and administrative audit logs.
 */
export async function getOrderEvents(orderId: string, orderNumber?: string): Promise<OrderEventDto[]> {
  const events: OrderEventDto[] = [];

  // 1. Order status history
  try {
    const historyRows = await db()
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, orderId))
      .orderBy(orderStatusHistory.createdAt);

    for (const h of historyRows) {
      const isPayment = h.kind === 'payment';
      const isFulfillment = h.kind === 'fulfillment';

      events.push({
        eventId: h.id,
        orderId: h.orderId,
        eventType: normalizeEventType(h.toStatus, h.kind),
        entityType: isPayment ? 'payment' : isFulfillment ? 'delivery' : 'order',
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        actorType: h.actorId?.startsWith('system') ? 'system' : h.actorId ? 'pharmacist' : 'customer',
        actorId: h.actorId ?? undefined,
        actorName: h.actorId?.startsWith('system') ? 'نظام إنجزني' : h.actorId ? 'فريق الصيدلية' : 'العميل',
        sourceApp: h.actorId?.startsWith('system') ? 'engezny_web' : 'ragab_web',
        outcome: 'success',
        correlationId: orderId,
        metadata: h.note ? { note: h.note } : undefined,
        createdAt: h.createdAt.toISOString(),
      });
    }
  } catch (err) {
    // Graceful fallback
  }

  // 2. Shipment & Courier Events
  try {
    const shipmentList = await db()
      .select()
      .from(shipments)
      .where(eq(shipments.orderId, orderId));

    for (const s of shipmentList) {
      const sEvents = await db()
        .select()
        .from(shipmentEvents)
        .where(eq(shipmentEvents.shipmentId, s.id))
        .orderBy(shipmentEvents.createdAt);

      for (const se of sEvents) {
        events.push({
          eventId: se.id,
          orderId,
          deliveryId: s.id,
          eventType: `delivery.${se.status}`,
          entityType: 'delivery',
          fromStatus: null,
          toStatus: se.status,
          actorType: 'courier',
          actorName: s.driverName ?? 'مندوب التوصيل',
          sourceApp: 'engezny_mobile',
          outcome: se.status === 'failed' ? 'failed' : 'success',
          reasonCode: se.status === 'failed' ? 'DELIVERY_FAILED' : undefined,
          correlationId: orderId,
          metadata: {
            driverName: s.driverName,
            driverPhone: s.driverPhone,
            note: se.note,
          },
          createdAt: se.createdAt.toISOString(),
        });
      }
    }
  } catch (err) {
    // Graceful fallback
  }

  // 3. Admin Audit Logs for this order (catches rejected transitions & administrative actions)
  try {
    const auditRows = await db()
      .select()
      .from(auditLogs)
      .where(
        or(
          eq(auditLogs.resourceId, orderId),
          orderNumber ? eq(auditLogs.target, orderNumber) : sql`FALSE`
        )
      )
      .orderBy(auditLogs.createdAt);

    for (const a of auditRows) {
      const meta = (a.metadata as Record<string, any>) || {};
      const isRejected = a.result === 'failure' || a.action.includes('rejected') || meta.rejected;
      const eventType = meta.eventType || (a.action.includes('status') ? 'order.status_updated' : a.action);

      // Avoid duplicating events that are already tracked by orderStatusHistory
      const isDuplicate = events.some(
        (e) =>
          Math.abs(new Date(e.createdAt).getTime() - a.createdAt.getTime()) < 1500 &&
          (e.toStatus === meta.to || e.eventType === eventType)
      );

      if (!isDuplicate) {
        events.push({
          eventId: a.id,
          orderId,
          eventType,
          entityType: 'order',
          fromStatus: meta.from ?? null,
          toStatus: meta.to ?? (meta.status || a.action),
          actorType: a.actorRole === 'admin' || a.actorRole === 'staff' ? 'pharmacist' : 'system',
          actorId: a.actorId ?? undefined,
          actorName: a.actorName || 'إدارة الصيدلية',
          sourceApp: 'ragab_web',
          outcome: isRejected ? 'rejected' : a.result === 'failure' ? 'failed' : 'success',
          reasonCode: (meta.reasonCode as ReasonCode) || (isRejected ? 'INVALID_STATE_TRANSITION' : undefined),
          errorMessage: meta.error || undefined,
          correlationId: a.requestId || orderId,
          metadata: meta,
          createdAt: a.createdAt.toISOString(),
        });
      }
    }
  } catch (err) {
    // Graceful fallback
  }

  // Sort chronologically ascending
  events.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return events;
}
