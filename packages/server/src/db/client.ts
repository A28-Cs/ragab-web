/**
 * Database client (§25 connection pooling). A single pooled postgres.js connection
 * shared process-wide. The `app` role used here has DML but NOT the ability to
 * UPDATE/DELETE append-only tables (audit_logs, order_status_history) — that is
 * enforced by triggers/grants in the migrations, so the DB is the last line of
 * defense (§4).
 */
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { serverEnv } from '../config/env';
import * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Either the pool or an open transaction — services accept this so they compose. */
export type DbExecutor = Database | Transaction;

let sqlClient: ReturnType<typeof postgres> | null = null;
let dbInstance: Database | null = null;

export function sql() {
  if (!sqlClient) {
    const env = serverEnv();
    sqlClient = postgres(env.DATABASE_URL, {
      max: env.DATABASE_POOL_MAX,
      idle_timeout: 20,
      max_lifetime: 60 * 30,
      // Fail fast rather than hang a request forever on a dead DB.
      connect_timeout: 10,
      prepare: true,
    });
  }
  return sqlClient;
}

export function db(): Database {
  if (!dbInstance) {
    dbInstance = drizzle(sql(), { schema, logger: false });
  }
  return dbInstance;
}

/** Graceful shutdown (§49). */
export async function closeDb(): Promise<void> {
  if (sqlClient) {
    await sqlClient.end({ timeout: 5 });
    sqlClient = null;
    dbInstance = null;
  }
}
