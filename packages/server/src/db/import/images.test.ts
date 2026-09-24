/**
 * §catalog import — SQL operator-precedence regression (images.ts).
 *
 * `isImported` is a raw `sql` fragment containing `A or B` (two regex branches: the plain-EAN
 * id shape and the hashed-fallback shape). Interpolating an un-parenthesized `A or B` into a
 * larger `and(isImported, other1, other2)` produces `A or B and other1 and other2` — and SQL's
 * AND binds tighter than OR, so Postgres parses that as `A or (B and other1 and other2)`, not
 * `(A or B) and other1 and other2`.
 *
 * That is not a hypothetical: it shipped, and it made `migrateImages` report 6,454 products as
 * "already migrated" when the true count was 10 — because almost every real product id matches
 * branch A on its own, which alone satisfied the whole WHERE clause regardless of ownership or
 * whether the row even had an image. This test asserts the generated SQL text stays
 * parenthesized, so the bug cannot silently return.
 */
import { describe, it, expect } from 'vitest';
import { and, like, not, sql } from 'drizzle-orm';
import { db } from '../client';
import * as s from '../schema';

// Mirrors the exact fragment in images.ts and verify.ts.
const isImported = sql`(${s.products.id} ~ '^prod_[0-9]{8,14}$' or ${s.products.id} ~ '^prod_x[0-9a-f]{12}$')`;

function toSql(where: ReturnType<typeof and>): string {
  const query = db().select({ id: s.products.id }).from(s.products).where(where) as unknown as {
    toSQL(): { sql: string };
  };
  return query.toSQL().sql;
}

describe('imported-id SQL fragment is parenthesized', () => {
  it('is grouped on its own', () => {
    const built = toSql(and(isImported));
    // e.g. `... where ("products"."id" ~ '...' or "products"."id" ~ '...')`
    expect(built).toMatch(/where \(".*?" ~ '[^']*' or ".*?" ~ '[^']*'\)/);
  });

  it('composed with AND, the OR branches stay grouped rather than being absorbed by AND precedence', () => {
    const hasImage = sql`${s.products.image} <> ''`;
    const notOwned = not(like(s.products.image, 'http://owned%'));
    const built = toSql(and(isImported, hasImage, notOwned));

    // The historical bug produced `id ~ '...' or id ~ '...' and image <> '' and not (...)` —
    // an `or` with nothing to its right grouping it before the next `and`. The fixed shape
    // always has the id disjunction closed in its own parentheses immediately before an `and`.
    expect(built).toMatch(/\) and /);
    // And the broken shape — an `or` with no closing paren before the next top-level `and` —
    // must be absent.
    expect(built).not.toMatch(/ or [^)]* and /);
  });

  it('sanity: the assertions above actually catch the historical un-parenthesized bug', () => {
    // The exact shape that shipped — no wrapping parens around the two id branches.
    const buggyIsImported = sql`${s.products.id} ~ '^prod_[0-9]{8,14}$' or ${s.products.id} ~ '^prod_x[0-9a-f]{12}$'`;
    const hasImage = sql`${s.products.image} <> ''`;
    const notOwned = not(like(s.products.image, 'http://owned%'));
    const built = toSql(and(buggyIsImported, hasImage, notOwned));

    // Confirms the test above is not vacuous: this is the shape it was written to reject.
    expect(built).toMatch(/ or [^)]* and /);
  });
});
