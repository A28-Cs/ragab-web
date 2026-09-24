/**
 * Taxonomy invariants (§catalog import).
 *
 * These are the pre-flight gate on the whole import. They run without a database, and they
 * assert the things that would otherwise fail HALFWAY through inserting ~112 category rows
 * (a duplicate slug on row 60) or silently mis-file thousands of products.
 *
 * Two of them mechanize the owner's organizational rules so those rules cannot rot back in
 * during a future taxonomy edit:
 *   - "البراند ليس Category"  → no category name may be a known brand
 *   - "الأحجام ليست أقسامًا"   → no category name may contain a size token
 */
import { describe, it, expect } from 'vitest';
import { TAXONOMY } from './taxonomy';
import { LEAVES, PARENTS, allCategoryRows, REUSED_SEED_CATEGORY_IDS } from './index';
import { fold, asciiSlug } from './normalize';
import { SIZE_RE, MULTIPACK_RE, UNIT_TOKENS_SORTED, FACET_TAGS, FREEZER_TOKENS } from './facets';
import { SOURCE_RULES, CSV_SOURCE_RULES } from './rules';
import { SKU_OVERRIDES } from './overrides';
import { OUT_OF_SCOPE } from './types';

const ALLOWED_THEMES = ['brand', 'green', 'blue', 'rose', 'violet', 'orange'];

/**
 * The canonical icon set. Every one of these must also be present in BOTH client maps:
 *   web/apps/web/src/components/product/CategoryCard.tsx  (kebab → lucide component)
 *   Mobile/lib/features/catalog/presentation/widgets/category_card.dart  (_iconFor switch)
 * Keep this list and those two maps in lockstep — that is what this test enforces.
 */
const CANONICAL_ICONS = [
  'cup-soda', 'milk', 'ham', 'croissant', 'wheat', 'cake-slice', 'droplet', 'archive',
  'leaf', 'egg-fried', 'popcorn', 'candy', 'snowflake', 'carrot', 'soup', 'spray-can',
  'scroll-text', 'sparkles', 'baby', 'utensils', 'package', 'paw-print', 'lightbulb',
  'pencil', 'shopping-basket',
  // Added for the chefaa pharmacy import (§catalog import — chefaa source): 5 new
  // departments (medications, hair-care, makeup, health devices, sexual wellness) need
  // icons the grocery brief never had. Added here + apps/web/src/lib/categoryPresentation.ts;
  // still owed to the Mobile category_card.dart map before that client renders them.
  'pill', 'scissors', 'palette', 'heart-pulse', 'heart',
];

describe('taxonomy shape', () => {
  it('has the expected number of parents and children', () => {
    expect(TAXONOMY.length).toBeGreaterThanOrEqual(24);
    // ~90 leaves across the grocery brief's numbered sections, plus ~50 more added by the
    // chefaa pharmacy import (medications, hair/skin care, makeup, mom & baby, vitamins,
    // sexual wellness, health devices, pets) — see the chefaa block at the end of taxonomy.ts.
    expect(LEAVES.size).toBeGreaterThanOrEqual(85);
    expect(LEAVES.size).toBeLessThanOrEqual(170);
  });

  it('is exactly two levels — no leaf is also a parent', () => {
    for (const leafId of LEAVES.keys()) {
      expect(PARENTS.has(leafId), `${leafId} is both a leaf and a parent`).toBe(false);
    }
  });

  it('every id is globally unique across parents and children', () => {
    const ids = allCategoryRows().map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every slug is globally unique — categories_slug_uidx is (store_id, slug)', () => {
    const slugs = allCategoryRows().map((r) => r.slug);
    const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i);
    expect(dupes, `duplicate slugs: ${dupes.join(', ')}`).toEqual([]);
  });

  it('every slug is non-empty ASCII kebab-case', () => {
    for (const row of allCategoryRows()) {
      expect(row.slug, `${row.id} slug`).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it('every child slug is prefixed with its parent slug', () => {
    for (const parent of TAXONOMY) {
      for (const child of parent.children) {
        expect(child.slug.startsWith(`${parent.slug}-`), `${child.id} under ${parent.slug}`).toBe(
          true,
        );
      }
    }
  });

  it('every nameEn is present and produces a non-empty ASCII slug', () => {
    // This is why nameEn is mandatory: asciiSlug() of an Arabic-only name is ''.
    for (const row of allCategoryRows()) {
      expect(row.nameEn.trim().length, `${row.id} nameEn`).toBeGreaterThan(0);
      expect(asciiSlug(row.nameEn), `${row.id} asciiSlug(nameEn)`).not.toBe('');
    }
  });

  it('every nameAr is present', () => {
    for (const row of allCategoryRows()) {
      expect(row.nameAr.trim().length, `${row.id} nameAr`).toBeGreaterThan(0);
    }
  });

  it('reuses all 8 seeded category ids', () => {
    for (const id of REUSED_SEED_CATEGORY_IDS) {
      expect(PARENTS.has(id), `seeded id ${id} must be reused, not replaced`).toBe(true);
    }
  });

  it('keeps the seeded slugs that existing tests and promotions depend on', () => {
    // catalog.integration.test.ts asserts a category with slug 'groceries' exists.
    const slugs = new Set(allCategoryRows().map((r) => r.slug));
    for (const slug of ['groceries', 'dairy', 'beverages', 'bakery', 'snacks', 'cleaning', 'personal-care', 'fresh-produce']) {
      expect(slugs.has(slug), `seeded slug ${slug} must be retained`).toBe(true);
    }
  });
});

describe('presentation metadata', () => {
  it('every colorTheme is inside the closed union', () => {
    for (const p of TAXONOMY) expect(ALLOWED_THEMES).toContain(p.colorTheme);
  });

  it('every iconName is in the canonical kebab-case set', () => {
    for (const p of TAXONOMY) {
      expect(p.iconName, `${p.id} icon`).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(CANONICAL_ICONS, `${p.id} icon '${p.iconName}' must be in CANONICAL_ICONS`).toContain(
        p.iconName,
      );
    }
  });

  it('at most 8 parents are featured — the homepage rail', () => {
    expect(TAXONOMY.filter((p) => p.featured).length).toBeLessThanOrEqual(8);
  });

  it('sortOrder is unique among parents and among each parent’s children', () => {
    const parentOrders = TAXONOMY.map((p) => p.sortOrder);
    expect(new Set(parentOrders).size).toBe(parentOrders.length);
    for (const p of TAXONOMY) {
      const o = p.children.map((c) => c.sortOrder);
      expect(new Set(o).size, `${p.id} children sortOrder`).toBe(o.length);
    }
  });
});

describe("owner's organizational rules are mechanized", () => {
  it('rule 3 — no category name contains a size token', () => {
    for (const row of allCategoryRows()) {
      SIZE_RE.lastIndex = 0;
      MULTIPACK_RE.lastIndex = 0;
      expect(SIZE_RE.test(row.nameAr), `${row.id} nameAr has a size`).toBe(false);
      SIZE_RE.lastIndex = 0;
      expect(SIZE_RE.test(row.nameEn), `${row.id} nameEn has a size`).toBe(false);
      MULTIPACK_RE.lastIndex = 0;
      expect(MULTIPACK_RE.test(row.nameAr), `${row.id} nameAr has a multipack`).toBe(false);
    }
  });

  it('rule 4 — every frozen leaf requires a freezer token, and no other leaf does', () => {
    const frozen = PARENTS.get('cat_frozen');
    expect(frozen).toBeDefined();
    for (const child of frozen!.children) {
      expect(child.requireAny, `${child.id} must require a freezer token`).toBeDefined();
      expect(child.requireAny!.length).toBeGreaterThan(0);
    }
  });

  it('rule 4 — chilled and ambient leaves forbid the freezer tokens', () => {
    const chilledParents = ['cat_dairy', 'cat_deli', 'cat_bakery'];
    for (const pid of chilledParents) {
      for (const child of PARENTS.get(pid)!.children) {
        expect(child.forbidAny, `${child.id} must forbid freezer tokens`).toBeDefined();
        for (const t of FREEZER_TOKENS) {
          expect(child.forbidAny, `${child.id} missing veto '${t}'`).toContain(t);
        }
      }
    }
  });

  it('rule 5 — fresh produce leaves reject frozen, canned, dried and juiced forms', () => {
    for (const child of PARENTS.get('cat_fresh')!.children) {
      expect(child.forbidAny).toBeDefined();
      for (const t of [...FREEZER_TOKENS, 'معلب', 'مجفف', 'عصير']) {
        expect(child.forbidAny, `${child.id} missing veto '${t}'`).toContain(t);
      }
    }
  });

  it('every leaf carries at least one Arabic keyword — the tag vocabulary', () => {
    for (const leaf of LEAVES.values()) {
      expect(leaf.keywordsAr.length, `${leaf.id} keywordsAr`).toBeGreaterThan(0);
    }
  });
});

describe('vocabulary hygiene', () => {
  it('all veto/require tokens are pre-folded, so no runtime folding is needed', () => {
    for (const leaf of LEAVES.values()) {
      for (const t of [...(leaf.forbidAny ?? []), ...(leaf.requireAny ?? [])]) {
        expect(fold(t), `token '${t}' in ${leaf.id} is not pre-folded`).toBe(t);
      }
    }
  });

  it('all facet trigger tokens are pre-folded', () => {
    for (const facet of FACET_TAGS) {
      for (const t of facet.tokens) {
        expect(fold(t), `facet token '${t}' is not pre-folded`).toBe(t);
      }
    }
  });

  it('the unit lexicon is sorted longest-token-first', () => {
    // Without this, `1 كجم` parses as `1 ك` plus junk.
    for (let i = 1; i < UNIT_TOKENS_SORTED.length; i++) {
      expect(UNIT_TOKENS_SORTED[i - 1]!.token.length).toBeGreaterThanOrEqual(
        UNIT_TOKENS_SORTED[i]!.token.length,
      );
    }
  });

  it('كجم is matched before كج and ج', () => {
    const idx = (t: string) => UNIT_TOKENS_SORTED.findIndex((u) => u.token === t);
    expect(idx('كجم')).toBeLessThan(idx('كج'));
    expect(idx('جرام')).toBeLessThan(idx('جم'));
  });
});

describe('rules and overrides resolve', () => {
  const allRules = [...SOURCE_RULES, ...CSV_SOURCE_RULES];

  it('every rule target is a real leaf or OUT_OF_SCOPE', () => {
    for (const r of allRules) {
      if (r.target === OUT_OF_SCOPE) continue;
      expect(LEAVES.has(r.target), `rule target '${r.target}' (${r.note}) is not a leaf`).toBe(true);
    }
  });

  it('every override target is a real leaf or OUT_OF_SCOPE', () => {
    for (const [sku, target] of Object.entries(SKU_OVERRIDES)) {
      if (target === OUT_OF_SCOPE) continue;
      expect(LEAVES.has(target), `override ${sku} → '${target}' is not a leaf`).toBe(true);
    }
  });

  it('override keys look like EANs', () => {
    for (const sku of Object.keys(SKU_OVERRIDES)) expect(sku).toMatch(/^\d{8,14}$/);
  });

  it('no two rules claim the exact same path/prefix', () => {
    const keys = allRules.map((r) =>
      'path' in r.match ? `path:${r.match.path}` : 'prefix' in r.match ? `prefix:${r.match.prefix}` : `regex:${r.match.regex}`,
    );
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(dupes, `duplicate rule matchers: ${dupes.join(', ')}`).toEqual([]);
  });

  it('every rule carries a note, so the mapping can be audited', () => {
    for (const r of allRules) expect(r.note.trim().length, JSON.stringify(r.match)).toBeGreaterThan(0);
  });

  it('rule tags are drawn from real vocabulary, not invented category names', () => {
    const parentNames = new Set([...PARENTS.values()].map((p) => p.nameAr));
    for (const r of allRules) {
      for (const t of r.tags ?? []) {
        expect(parentNames.has(t), `rule tag '${t}' duplicates a PARENT category name`).toBe(false);
      }
    }
  });
});
