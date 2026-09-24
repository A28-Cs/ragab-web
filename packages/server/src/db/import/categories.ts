/**
 * Category loader (§catalog import, load stage).
 *
 * Upserts the 25 parents + ~91 children from `db/taxonomy` into the `categories` table.
 * Order matters: parents MUST land before children, because `categories.parent_id` now
 * carries a real FK (migration 0012).
 *
 * The 8 ids reused from db/seed.ts (see taxonomy.ts's header comment) get a lighter touch:
 * only sortOrder/iconName/colorTheme/featured are overwritten, so their existing image and
 * hand-written descriptions survive. Every other category is a full upsert.
 */
import { eq } from 'drizzle-orm';
import { db } from '../client';
import * as s from '../schema';
import { TAXONOMY, REUSED_SEED_CATEGORY_IDS, allCategoryRows } from '../taxonomy';
import { logger } from '../../lib/logger';

const log = logger().child({ component: 'import:categories' });
const REUSED = new Set(REUSED_SEED_CATEGORY_IDS);

export interface LoadCategoriesResult {
  parentsInserted: number;
  parentsUpdated: number;
  childrenInserted: number;
}

export async function loadCategories(): Promise<LoadCategoriesResult> {
  const d = db();
  const rows = allCategoryRows();
  const parents = rows.filter((r) => r.parentId === null);
  const children = rows.filter((r) => r.parentId !== null);
  let parentsInserted = 0;
  let parentsUpdated = 0;

  // ── Parents first (children's FK depends on them existing) ──────────────────────────
  for (const p of parents) {
    if (REUSED.has(p.id)) {
      const res = await d
        .update(s.categories)
        .set({ sortOrder: p.sortOrder, iconName: p.iconName, colorTheme: p.colorTheme, featured: p.featured, isActive: p.isActive })
        .where(eq(s.categories.id, p.id))
        .returning({ id: s.categories.id });
      if (res.length > 0) parentsUpdated += 1;
      else {
        // Reused id not actually present yet (a fresh DB with no seed run) — insert it.
        await d.insert(s.categories).values({
          id: p.id, slug: p.slug, nameAr: p.nameAr, nameEn: p.nameEn, iconName: p.iconName,
          colorTheme: p.colorTheme, parentId: null, sortOrder: p.sortOrder, featured: p.featured,
          isActive: p.isActive,
        }).onConflictDoNothing();
        parentsInserted += 1;
      }
      continue;
    }

    await d
      .insert(s.categories)
      .values({
        id: p.id, slug: p.slug, nameAr: p.nameAr, nameEn: p.nameEn, iconName: p.iconName,
        colorTheme: p.colorTheme, parentId: null, sortOrder: p.sortOrder, featured: p.featured,
        isActive: p.isActive,
      })
      .onConflictDoUpdate({
        target: s.categories.id,
        set: {
          slug: p.slug, nameAr: p.nameAr, nameEn: p.nameEn, iconName: p.iconName,
          colorTheme: p.colorTheme, sortOrder: p.sortOrder, featured: p.featured, isActive: p.isActive,
        },
      });
    parentsInserted += 1;
  }

  // ── Children ──────────────────────────────────────────────────────────────────────
  for (const c of children) {
    await d
      .insert(s.categories)
      .values({
        id: c.id, slug: c.slug, nameAr: c.nameAr, nameEn: c.nameEn, iconName: c.iconName,
        colorTheme: c.colorTheme, parentId: c.parentId, sortOrder: c.sortOrder, featured: false,
        isActive: c.isActive,
      })
      .onConflictDoUpdate({
        target: s.categories.id,
        set: {
          slug: c.slug, nameAr: c.nameAr, nameEn: c.nameEn, iconName: c.iconName,
          colorTheme: c.colorTheme, parentId: c.parentId, sortOrder: c.sortOrder, isActive: c.isActive,
        },
      });
  }

  log.info(
    { parents: parents.length, children: children.length, taxonomyParents: TAXONOMY.length },
    'categories loaded',
  );
  return { parentsInserted, parentsUpdated, childrenInserted: children.length };
}
