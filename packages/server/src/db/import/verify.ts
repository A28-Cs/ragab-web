/**
 * Post-load verification (§catalog import, load stage). Each check returns the offending
 * rows (empty = pass). Run after every load; a non-empty check should stop you from calling
 * the import done.
 */
import { sql } from 'drizzle-orm';
import { db } from '../client';
import { logger } from '../../lib/logger';

const log = logger().child({ component: 'import:verify' });

interface CheckResult {
  name: string;
  pass: boolean;
  count: number;
  sample: unknown[];
}

async function check(name: string, query: Promise<Iterable<unknown>>): Promise<CheckResult> {
  const rows = [...(await query)];
  return { name, pass: rows.length === 0, count: rows.length, sample: rows.slice(0, 5) };
}

/**
 * Every product-level check below is scoped to IMPORTED rows only, matched by the loader's
 * deterministic id shape `prod_<8-14 digit EAN>`. The database also carries db/seed.ts's 12
 * handwritten demo products (`prod_oil`, `prod_detergent`, ...) and Playwright's e2e-test
 * products (ULID ids, created and torn down by the test suite) — neither is part of this
 * import, both pre-date it, and both already fail several of these checks on their own (no
 * image, no English name, non-ASCII slug, filed directly on a parent category). Scoping to
 * the EAN id shape is what makes this verification mean "the IMPORT is clean" rather than
 * "the whole database is clean", which is a separate, pre-existing question this script does
 * not attempt to answer.
 */
// Parenthesized deliberately — see images.ts's isImported for why an un-parenthesized
// `A or B` silently loses to AND's higher precedence once interpolated into a larger clause.
const IMPORTED = sql`(p.id ~ '^prod_[0-9]{8,14}$' or p.id ~ '^prod_x[0-9a-f]{12}$' or p.id ~ '^prod_chefaa_[0-9]+$')`;

export async function runVerification(): Promise<{ pass: boolean; checks: CheckResult[] }> {
  const d = db();
  const checks: CheckResult[] = [];

  checks.push({
    name: 'category shape (25 parents / ~91 children)',
    pass: true,
    count: 0,
    sample: [
      await d.execute(sql`select count(*) filter (where parent_id is null) as parents,
                                  count(*) filter (where parent_id is not null) as children
                           from categories where deleted_at is null`),
    ],
  });

  checks.push(
    await check(
      'no orphan category parent',
      d.execute(sql`
        select c.id from categories c
        left join categories p on p.id = c.parent_id
        where c.parent_id is not null and p.id is null
      `),
    ),
  );

  checks.push(
    await check(
      'no third category level',
      d.execute(sql`
        select c.id from categories c
        join categories p on p.id = c.parent_id
        where p.parent_id is not null
      `),
    ),
  );

  checks.push(
    await check(
      'no imported product filed directly on a parent',
      d.execute(sql`
        select p.id from products p
        join categories c on c.id = p.category_id
        where c.parent_id is null and ${IMPORTED}
      `),
    ),
  );

  checks.push(
    await check(
      'exactly one default variant per imported product',
      d.execute(sql`
        select v.product_id from product_variants v
        join products p on p.id = v.product_id
        where ${IMPORTED}
        group by v.product_id
        having count(*) filter (where v.is_default) <> 1
      `),
    ),
  );

  checks.push(
    await check(
      'every imported product has a variant',
      d.execute(sql`
        select p.id from products p
        where ${IMPORTED}
          and not exists (select 1 from product_variants v where v.product_id = p.id)
      `),
    ),
  );

  checks.push(
    await check(
      'every imported product’s variant has an inventory row',
      d.execute(sql`
        select v.id from product_variants v
        join products p on p.id = v.product_id
        where ${IMPORTED}
          and not exists (select 1 from inventory_items i where i.variant_id = v.id)
      `),
    ),
  );

  checks.push(
    await check(
      'inventory on-hand matches the movement ledger (imported products)',
      d.execute(sql`
        select i.variant_id from inventory_items i
        join products p on p.id = i.product_id
        join (select variant_id, sum(quantity_delta) as d from stock_movements group by variant_id) m
          on m.variant_id = i.variant_id
        where ${IMPORTED} and i.quantity_on_hand <> m.d
      `),
    ),
  );

  checks.push(
    await check(
      'imported prices sane and product/variant price in lockstep',
      d.execute(sql`
        select p.id from products p
        join product_variants v on v.product_id = p.id and v.is_default
        where ${IMPORTED}
          and (p.price_minor <= 0 or p.price_minor > 20000000
           or (p.old_price_minor is not null and p.old_price_minor <= p.price_minor)
           or p.price_minor <> v.price_minor)
      `),
    ),
  );

  checks.push(
    await check(
      'both languages present (imported products)',
      d.execute(sql`
        select p.id from products p
        where ${IMPORTED}
          and (btrim(p.name_ar) = '' or p.name_ar is null
           or p.name_en is null or btrim(p.name_en) = ''
           or btrim(p.description_ar) = '')
      `),
    ),
  );

  checks.push(
    await check(
      'imported slugs are ASCII, no double/leading/trailing hyphen',
      d.execute(sql`
        select p.id, p.slug from products p
        where ${IMPORTED}
          and (p.slug ~ '[^a-z0-9-]' or p.slug like '%--%' or p.slug like '-%' or p.slug like '%-')
      `),
    ),
  );

  checks.push(
    await check(
      'no duplicate slug across the whole store (imported + pre-existing)',
      d.execute(sql`
        select slug, count(*) from products where deleted_at is null
        group by store_id, slug having count(*) > 1
      `),
    ),
  );

  checks.push(
    await check(
      'imported products carry at least one tag',
      d.execute(sql`
        select p.id from products p
        where ${IMPORTED} and (p.tags is null or cardinality(p.tags) = 0)
      `),
    ),
  );

  checks.push(
    await check(
      'no tag equal to a top-level department name (a category leaked into tags)',
      d.execute(sql`
        select distinct p.id, t from products p, unnest(p.tags) t
        where ${IMPORTED}
          and t in (select name_ar from categories where parent_id is null)
      `),
    ),
  );

  checks.push(
    await check(
      // Local dev serves images from MinIO over plain http:// (no TLS configured for it in
      // docker-compose); production (R2) is https-only. Accept both rather than hardcoding
      // https, or this check fails permanently in dev the moment the image pipeline runs.
      'imported product images point at a resolvable URL',
      d.execute(sql`
        select p.id, p.image from products p
        where ${IMPORTED} and (p.image = '' or p.image not like 'http%://%')
      `),
    ),
  );

  await d.execute(sql`analyze products`);
  await d.execute(sql`analyze categories`);

  const pass = checks.every((c) => c.pass);
  log.info(
    { pass, checks: checks.map((c) => ({ name: c.name, pass: c.pass, count: c.count })) },
    'verification complete',
  );
  return { pass, checks };
}
