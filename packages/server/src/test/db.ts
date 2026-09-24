/**
 * Test-only DB helpers. Append-only tables (audit_logs, order_status_history,
 * stock_movements) reject DELETE by trigger — correct in production, but tests need
 * to reset them. `withTriggersDisabled` runs cleanup with session_replication_role =
 * replica (test DB role is superuser), which suppresses user triggers for that tx only.
 */
import { sql } from 'drizzle-orm';
import { db } from '../db/client';

export async function withTriggersDisabled<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  return db().transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL session_replication_role = replica`);
    return fn(tx);
  });
}
