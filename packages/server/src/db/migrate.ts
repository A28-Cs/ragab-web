/**
 * Migration runner (§40). Applies every `*.sql` in ./migrations in lexical order,
 * once, inside a transaction, tracking applied files in `_migrations`. Reproducible,
 * reviewable, and safe to re-run (already-applied files are skipped). Works for both
 * drizzle-kit-generated and hand-authored migrations because both use the
 * `--> statement-breakpoint` separator.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import postgres from 'postgres';
import { serverEnv } from '../config/env';
import { logger } from '../lib/logger';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, 'migrations');

export async function runMigrations(databaseUrl = serverEnv().DATABASE_URL): Promise<string[]> {
  const log = logger().child({ component: 'migrate' });
  const sql = postgres(databaseUrl, { max: 1 });
  const applied: string[] = [];
  try {
    await sql`CREATE TABLE IF NOT EXISTS "_migrations" (
      "name" text PRIMARY KEY,
      "applied_at" timestamptz NOT NULL DEFAULT now()
    )`;

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const done = await sql`SELECT 1 FROM "_migrations" WHERE "name" = ${file}`;
      if (done.length > 0) continue;

      const raw = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      const statements = raw
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !/^(--.*\s*)*$/.test(s));

      await sql.begin(async (tx) => {
        for (const statement of statements) {
          await tx.unsafe(statement);
        }
        await tx`INSERT INTO "_migrations" ("name") VALUES (${file})`;
      });

      applied.push(file);
      log.info({ file, statements: statements.length }, 'migration applied');
    }

    if (applied.length === 0) log.info('database already up to date');
    return applied;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Run directly: `tsx src/db/migrate.ts`
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runMigrations()
    .then((applied) => {
      // eslint-disable-next-line no-console
      console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Up to date.');
      process.exit(0);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
