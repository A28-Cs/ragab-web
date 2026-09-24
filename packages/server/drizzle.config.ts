import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit is the source of truth for TABLE structure (columns, FKs, indexes).
 * The DB-integrity layer that Drizzle cannot express — CHECK constraints, triggers,
 * tsvector/trigram, append-only enforcement, the refund-cap trigger — lives in a
 * hand-authored follow-up migration (see src/db/migrations/*_integrity.sql).
 */
export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/ragab',
  },
  casing: 'snake_case',
  verbose: true,
  strict: true,
});
