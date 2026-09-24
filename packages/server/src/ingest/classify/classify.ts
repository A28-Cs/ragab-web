/**
 * Classification engine (§catalog import, stage 3).
 *
 * Maps each product onto EXACTLY ONE of the ~91 leaves, plus tags. Four tiers, first match
 * wins:
 *
 *   A  overrides.ts       explicit sku → leaf, the review queue's checked-in output   1.00
 *   B  rules.ts           HyperOne url_path → leaf                                   0.90 / 0.70
 *   C  keyword match      the brief's bullets against a brand- and size-stripped name 0.40-0.85
 *   D  nothing                                                                        0.00
 *
 * `products.categoryId` is NOT NULL, so there is no "uncategorised" parking space: a tier-D
 * product is SKIPPED and sent to the review queue, never loaded with a placeholder category.
 *
 * The owner's hard rules are enforced as vetoes rather than conventions — see the guard
 * section below and the assertions in taxonomy.test.ts.
 */
import {
  LEAVES,
  PARENTS,
  SOURCE_RULES,
  SKU_OVERRIDES,
  BRANCH_MIRROR_RE,
  OUT_OF_SCOPE,
  FACET_TAGS,
  SIZE_RE,
  MULTIPACK_RE,
  fold,
  type Classification,
  type Leaf,
  type SourceRule,
} from '../../db/taxonomy';
import { BRAND_AR_SORTED, BRAND_STOPLIST } from '../../db/taxonomy/brands';

export interface ClassifyInput {
  sku: string;
  /** Arabic name — always present (products.nameAr is NOT NULL). */
  nameAr: string;
  nameEn: string | null;
  /** Size-stripped descriptors from the name parser; falls back to the full name. */
  descriptorAr: string;
  descriptorEn: string | null;
  /** Every source category this product belongs to, as `url_path` strings. */
  sourcePaths: readonly string[];
}

export interface ClassifyResult extends Classification {
  /** Tags to write to products.tags — matched bullets + facets + losing leaves. */
  tags: string[];
  /** True when every source path resolved outside the owner's 25 sections. */
  outOfScope: boolean;
  /** Source paths discarded by the multi-membership reduction → tags. */
  discardedPaths: string[];
  /** The rule that decided it, for the audit report. */
  ruleNote?: string;
}

/* ── Path normalization ─────────────────────────────────────────────────────────────── */

/**
 * Normalize a source path before matching. Stripping the branch-mirror suffix is what
 * collapses HyperOne's duplicated departments (`Bakery 01SA` ≡ `Bakery`, `Cheese 01SA`,
 * `Vegetables 01EC`, ...) — one regex instead of 85 extra rules.
 */
export function normalizePath(path: string): string {
  return path
    .split('/')
    .map((seg) => fold(seg.replace(BRANCH_MIRROR_RE, '')))
    .join('/');
}

function ruleMatches(rule: SourceRule, path: string): boolean {
  if ('path' in rule.match) return path === normalizePath(rule.match.path);
  if ('prefix' in rule.match) {
    const p = normalizePath(rule.match.prefix);
    return path === p || path.startsWith(`${p}/`);
  }
  return new RegExp(rule.match.regex, 'i').test(path);
}

/** First matching rule wins; array order in rules.ts is the tie-break, and is reviewable. */
function findRule(path: string): SourceRule | null {
  const norm = normalizePath(path);
  for (const rule of SOURCE_RULES) if (ruleMatches(rule, norm)) return rule;
  return null;
}

/* ── Guards: the owner's hard rules ─────────────────────────────────────────────────── */

/**
 * `forbidAny` VETOES a leaf outright. This is what stops `بيتزا مجمدة` landing in a chilled
 * bakery leaf even though `بيتزا` keyword-matches there.
 */
function isVetoed(leaf: Leaf, foldedText: string): boolean {
  return (leaf.forbidAny ?? []).some((t) => foldedText.includes(t));
}

/**
 * `requireAny` gates a leaf. Waived when tier B already decided, because the source tree is
 * stronger evidence than the product name — a product HyperOne files under `frozens/` is
 * frozen whether or not the word "مجمد" appears in its name.
 */
function meetsRequirement(leaf: Leaf, foldedText: string): boolean {
  const req = leaf.requireAny;
  if (!req || req.length === 0) return true;
  return req.some((t) => foldedText.includes(t));
}

/* ── Tier C: keyword scoring ────────────────────────────────────────────────────────── */

/**
 * Strip brand and size BEFORE keyword matching, so neither can ever be the token that
 * decides a category (owner rules 2 and 3).
 */
/**
 * A bare trailing multiplier, e.g. the `*20` left behind once SIZE_RE has removed `330مل`
 * from `330مل *20`. MULTIPACK_RE needs digits on both sides and so cannot catch it.
 */
const TRAILING_MULT_RE = /[x×*]\s*\d+/giu;

export function stripBrandAndSize(text: string): string {
  let out = ` ${fold(text)} `;
  SIZE_RE.lastIndex = 0;
  out = out.replace(SIZE_RE, ' ');
  MULTIPACK_RE.lastIndex = 0;
  out = out.replace(MULTIPACK_RE, ' ');
  TRAILING_MULT_RE.lastIndex = 0;
  out = out.replace(TRAILING_MULT_RE, ' ');
  for (const b of BRAND_AR_SORTED) {
    const ar = fold(b.ar);
    if (ar.length >= 3 && out.includes(ar)) out = out.split(ar).join(' ');
    const en = fold(b.en);
    if (en.length >= 3 && out.includes(en)) out = out.split(en).join(' ');
  }
  for (const s of BRAND_STOPLIST) {
    if (s.length < 3) continue;
    out = out.split(` ${s} `).join('  ');
  }
  return out.replace(/\s+/g, ' ').trim();
}

interface LeafScore {
  leafId: string;
  score: number;
  /** Owner bullets that matched — these become tags. */
  matched: string[];
  /** True when only a generic head noun matched, so there is nothing worth tagging. */
  genericOnly: boolean;
}

/**
 * Phrase match on TOKEN boundaries, not raw substring.
 *
 * Raw `includes()` produces real false positives in Arabic because words nest: the flavour
 * "بيناكولادا" (pina colada) contains "كولا" (cola), which tagged a whey-protein oat powder as
 * a carbonated drink. Requiring whole tokens removes that entire class of error.
 *
 * Returns the number of tokens matched (0 = no match), so the caller can still reward the more
 * specific keyword.
 */
function phraseTokens(haystack: readonly string[], needle: string): number {
  const want = needle.split(' ').filter(Boolean);
  if (want.length === 0) return 0;
  for (let i = 0; i + want.length <= haystack.length; i++) {
    let ok = true;
    for (let k = 0; k < want.length; k++) {
      if (haystack[i + k] !== want[k]) {
        ok = false;
        break;
      }
    }
    if (ok) return want.length;
  }
  return 0;
}

/**
 * Score every eligible leaf against the stripped name.
 *
 * `0.40 + 0.45 × matchedTokens / max(3, nameTokens)`, capped at 0.85. The effect is that a
 * three-token bullet (`مياه معدنية طبيعية`) outranks a one-token one (`مياه`) on the same
 * product — longest, most specific match wins, which is what you want when `عصير مانجو مجمد`
 * matches both `عصائر` and `مجمدات`.
 */
function scoreLeaves(strippedAr: string, strippedEn: string, fullFolded: string): LeafScore[] {
  const arTokens = strippedAr.split(' ').filter(Boolean);
  const enTokens = strippedEn.split(' ').filter(Boolean);
  const nameTokens = Math.max(3, arTokens.length);
  const out: LeafScore[] = [];

  for (const leaf of LEAVES.values()) {
    if (isVetoed(leaf, fullFolded)) continue;
    if (!meetsRequirement(leaf, fullFolded)) continue;

    const matched: string[] = [];
    let bestTokens = 0;

    for (const kw of leaf.keywordsAr) {
      const n = phraseTokens(arTokens, fold(kw));
      if (n > 0) {
        matched.push(kw);
        bestTokens = Math.max(bestTokens, n);
      }
    }
    for (const kw of leaf.keywordsEn) {
      const n = phraseTokens(enTokens, fold(kw));
      if (n > 0) {
        if (!matched.includes(kw)) matched.push(kw);
        bestTokens = Math.max(bestTokens, n);
      }
    }

    // Generic head nouns match but are NEVER tagged — the tag vocabulary stays the owner's
    // own words. They exist because the brief's bullets are specific ("زيت ذرة"), so a
    // product named just "زيت حار تشويس" matches no bullet at all without them.
    let genericTokens = 0;
    for (const kw of leaf.matchAlso ?? []) {
      const f = fold(kw);
      const hay = /[a-z]/.test(f) ? enTokens : arTokens;
      genericTokens = Math.max(genericTokens, phraseTokens(hay, f));
    }

    if (matched.length === 0 && genericTokens === 0) continue;
    const score = Math.min(0.85, 0.4 + 0.45 * (Math.max(bestTokens, genericTokens) / nameTokens));
    out.push({ leafId: leaf.id, score, matched, genericOnly: matched.length === 0 });
  }

  return out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Deterministic tie-break: the taxonomy's own declared order.
    const la = LEAVES.get(a.leafId)!;
    const lb = LEAVES.get(b.leafId)!;
    if (la.parent.sortOrder !== lb.parent.sortOrder) return la.parent.sortOrder - lb.parent.sortOrder;
    return la.sortOrder - lb.sortOrder;
  });
}

/* ── Facet tags ─────────────────────────────────────────────────────────────────────── */

function matchFacets(fullFolded: string): string[] {
  const out: string[] = [];
  for (const facet of FACET_TAGS) {
    if (facet.tokens.some((t) => fullFolded.includes(t))) out.push(facet.tag);
  }
  return out;
}

/* ── Main ───────────────────────────────────────────────────────────────────────────── */

const MAX_TAGS = 12;

/**
 * The allowlist for the cross-department redirect below. Every entry was reached because its
 * SOURCE leaf's coarse rule genuinely mixes an unrelated product type in with the right one,
 * and every one of its real redirects was hand-checked against the live catalog:
 *   cat_grains_rice     — rice sold by weight at an attar (spice) shop
 *   cat_snacks_nuts     — nuts sold by weight at an attar (spice) shop
 *   cat_conf_oriental   — finished basbousa/kunafa listed on the baking-ingredients page
 *   cat_ready_cooking   — cake/pancake mixes and bouillon cubes listed on the "healthy
 *                         snacks" and "baking ingredients" pages
 * Deliberately NOT here: cat_fresh_veg/fruit/herbs, cat_canned_legumes, cat_deli_salads,
 * cat_conf_candy, cat_bev_juices — each of these leaves' own keywords turned out to be bare
 * single words or genuine homographs (فلفل, حمص, فراولة, عدس, جيلي, ...) that collide with an
 * unrelated meaning often enough to make them unsafe redirect TARGETS. See the comment at the
 * call site for the specific failures this allowlist exists to prevent.
 */
const CROSS_DEPT_REDIRECT_TARGETS: ReadonlySet<string> = new Set([
  'cat_grains_rice',
  'cat_snacks_nuts',
  'cat_conf_oriental',
  'cat_ready_cooking',
]);

export function classify(input: ClassifyInput): ClassifyResult {
  const warnings: string[] = [];
  const fullFolded = `${fold(input.nameAr)} ${fold(input.nameEn ?? '')}`;
  const strippedAr = stripBrandAndSize(input.descriptorAr || input.nameAr);
  const strippedEn = stripBrandAndSize(input.descriptorEn ?? input.nameEn ?? '');

  /*
   * Multi-membership reduction, in fixed order:
   *   1. discard memberships that resolve OUT_OF_SCOPE
   *   2. keep the DEEPEST remaining path (most specific)
   *   3. break ties by rules.ts array order — a checked-in decision, not an accident
   * Every discarded membership becomes a tag, which is the owner's "one primary category,
   * use Tags instead of duplicating categories" implemented literally.
   */
  const resolved = input.sourcePaths.filter(Boolean).map((p) => ({ path: p, rule: findRule(p) }));
  const inScope = resolved.filter((r) => r.rule && r.rule.target !== OUT_OF_SCOPE);
  /*
   * Out of scope when NO path is in scope and at least one explicitly resolved out of scope.
   * Requiring *every* path to have a rule was too strict: a product under both `laundry`
   * (a bare parent with no rule) and `laundry/shoe-care` (explicitly out of scope) was landing
   * in the review queue instead of being dropped, which is how ~60 shoe polishes got there.
   */
  const outOfScopeOnly =
    inScope.length === 0 && resolved.some((r) => r.rule?.target === OUT_OF_SCOPE);

  const depth = (p: string) => p.split('/').length;
  inScope.sort((a, b) => {
    if (depth(b.path) !== depth(a.path)) return depth(b.path) - depth(a.path);
    return SOURCE_RULES.indexOf(a.rule!) - SOURCE_RULES.indexOf(b.rule!);
  });

  const discardedPaths = inScope.slice(1).map((r) => r.path);
  const facets = matchFacets(fullFolded);

  const finish = (
    leafId: string,
    confidence: number,
    tier: 'A' | 'B' | 'C',
    matched: string[],
    losing: string[],
    ambiguous: boolean,
    ruleNote?: string,
  ): ClassifyResult => {
    const leaf = LEAVES.get(leafId)!;
    /*
     * Only SIBLING losing leaves become tags. A cross-department runner-up is noise, and
     * Arabic homographs generate them: "انتنس كلور" (Intense Color) hits كلور (chlorine), so a
     * hair dye was being tagged "منظفات الغسيل". Restricting to the assigned department keeps
     * the owner's "tag instead of duplicate" mechanism useful without importing false signals.
     */
    const losingNames = losing
      .map((id) => LEAVES.get(id))
      .filter((l): l is Leaf => !!l && l.parent.id === leaf.parent.id)
      .map((l) => l.nameAr);
    const discardedNames = discardedPaths
      .map((p) => findRule(p)?.target)
      .map((id) => (id && id !== OUT_OF_SCOPE ? LEAVES.get(id)?.nameAr : undefined))
      .filter((x): x is string => !!x);

    let tags = [...new Set([...matched, ...facets, ...losingNames, ...discardedNames])].slice(
      0,
      MAX_TAGS,
    );
    // Never empty: tags are the only place a product's own TYPE is recorded.
    if (tags.length === 0) tags = [leaf.nameAr];

    // A tag equal to a PARENT name means a category leaked into the tag vocabulary.
    const parentNames = new Set([...PARENTS.values()].map((p) => p.nameAr));
    tags = tags.filter((t) => !parentNames.has(t));
    if (tags.length === 0) tags = [leaf.nameAr];

    return {
      leafId,
      confidence,
      tier,
      ambiguous,
      matchedKeywords: matched,
      losingLeaves: losing,
      warnings,
      tags,
      outOfScope: false,
      discardedPaths,
      ruleNote,
    };
  };

  // ── Tier A: explicit override ──────────────────────────────────────────────────────
  const override = SKU_OVERRIDES[input.sku];
  if (override) {
    if (override === OUT_OF_SCOPE) {
      return {
        leafId: '',
        confidence: 1,
        tier: 'A',
        ambiguous: false,
        matchedKeywords: [],
        losingLeaves: [],
        warnings,
        tags: [],
        outOfScope: true,
        discardedPaths: [],
        ruleNote: 'manual override → out of scope',
      };
    }
    const scores = scoreLeaves(strippedAr, strippedEn, fullFolded);
    return finish(override, 1, 'A', scores.find((s) => s.leafId === override)?.matched ?? [], [], false, 'manual override');
  }

  /*
   * The source tree's own verdict is stronger evidence than an incidental keyword hit, so it
   * must short-circuit HERE — before tier C ever runs — not merely serve as tier D's fallback
   * label. Without this, a product whose EVERY path resolves to OUT_OF_SCOPE (all under
   * `electronics/`, `toys/`, `christmas-products/`, ...) could still be "rescued" by a coincidental
   * keyword match: a Turkish "Coffee MAKER" (an appliance) matched قهوة and landed in Hot
   * Beverages; an air conditioner's "أبيض" (white) / "بارد" (cold) tokens matched enough to file
   * it under Hair Care; a puzzle box named "... ice cream ..." landed in Frozen. Verified against
   * the live catalog: 312 of 7,111 planned rows were exactly this failure before the fix.
   */
  if (outOfScopeOnly) {
    return {
      leafId: '',
      confidence: 0,
      tier: 'C',
      ambiguous: false,
      matchedKeywords: [],
      losingLeaves: [],
      warnings: [...warnings, 'OUT_OF_SCOPE'],
      tags: [],
      outOfScope: true,
      discardedPaths,
    };
  }

  // ── Tier B: source-path rule ───────────────────────────────────────────────────────
  /*
   * Walk the in-scope candidates in reduction order and take the first whose leaf is not
   * vetoed, rather than giving up on the winner. A frozen turkey sits under BOTH
   * `frozens/frozen-poultry` and `butchery-poultry/poultry`; the latter sorts first by rule
   * order and is a chilled leaf, so it is vetoed — and before this fallthrough the product
   * dropped all the way to tier C and ended up unclassified.
   */
  const winner = inScope.find((c) => {
    const l = c.rule ? LEAVES.get(c.rule.target) : undefined;
    return l && !isVetoed(l, fullFolded);
  });
  if (inScope.length > 0 && winner !== inScope[0]) warnings.push('RULE_VETOED_BY_FORBID');
  if (winner?.rule) {
    const leaf = LEAVES.get(winner.rule.target);
    if (leaf) {
      // forbidAny still applies at tier B: it encodes a physical fact (chilled vs frozen),
      // and a mis-scoped rule must not be able to override it.
      if (isVetoed(leaf, fullFolded)) {
        warnings.push('RULE_VETOED_BY_FORBID');
      } else {
        const scores = scoreLeaves(strippedAr, strippedEn, fullFolded);

        /*
         * A COARSE rule defers to a specific sibling. `food-cupboard/canned-food` covers all of
         * 8.1-8.4, so a blanket rule would file canned tuna under "Canned & Ready Meals" and
         * leave cat_canned_fish permanently empty. When a rule is marked `review` and keyword
         * matching confidently picks a SIBLING under the same parent, the sibling wins.
         *
         * Restricted to siblings on purpose: it refines within the department the grocer already
         * chose, so a bad keyword can shuffle a product one shelf over but never move it to a
         * different department.
         */
        if (winner.rule.review) {
          /*
           * 0.45, not 0.55. The score formula divides by name length, so a single decisive
           * token ("تونة" in "تونة خفيفة في زيت الصويا") scores only 0.49 in a five-token
           * name — and a higher bar left canned tuna in the generic ready-meals leaf. Being
           * restricted to SIBLINGS is what makes the lower bar safe: it can move a product one
           * shelf within the department the grocer already chose, never across departments.
           *
           * Deliberately NOT `!s.genericOnly` here (unlike the cross-department escape hatch
           * below): a bare generic match is exactly how "لمبة ليد" refines from the coarse
           * diy-tools rule into cat_hw_electrical, and how "بهار كفتة" refines from basic
           * spices into cat_spices_blends — both real, wanted redirects on generic tokens only.
           * A homograph false-positive this causes (رايب "milk-drink" bare-matching cat_dairy_
           * milk on its generic 'لبن' token) is fixed at the taxonomy level with `forbidAny`
           * instead of narrowing this check — see cat_dairy_milk's forbidAny in taxonomy.ts.
           */
          const sibling = scores.find(
            (s) =>
              s.score >= 0.45 &&
              s.leafId !== leaf.id &&
              LEAVES.get(s.leafId)?.parent.id === leaf.parent.id,
          );
          if (sibling) {
            return finish(
              sibling.leafId,
              Math.max(0.75, sibling.score),
              'C',
              sibling.matched,
              [leaf.id],
              false,
              `${winner.rule.note} → refined to sibling by keyword`,
            );
          }

          /*
           * CROSS-DEPARTMENT escape hatch, restricted to a small ALLOWLIST of verified-safe
           * targets (CROSS_DEPT_REDIRECT_TARGETS below) — not open to every leaf. Some coarse
           * rules cover a source department that genuinely mixes product TYPES from different
           * owner departments: an attar (spice) shop's own catalog page also sells rice and
           * nuts by weight; a "baking ingredients" page also carries finished basbousa; a
           * "healthy snacks" page is mostly cake/pancake-mix and bouillon products. Verified
           * live: "أرز بسمتي رجب العطار" (rice), "بندق أبو عوف" (hazelnuts) and "بسبوسة توب
           * فاليو" (a finished oriental sweet) were landing in the wrong department, all real
           * mistakes the same-parent sibling check above cannot reach because the correct leaf
           * sits under a DIFFERENT parent.
           *
           * `!s.genericOnly` requires the match to be against one of the OWNER'S OWN bullets
           * (e.g. "أرز بسمتي", "بندق", "بسبوسة", "مرقة دجاج" are literally in the brief), never
           * a generic matchAlso noun. That guard is necessary but NOT sufficient on its own —
           * a first version without the allowlist opened this up to every leaf and immediately
           * regressed on several: cat_fresh_veg/fruit/herbs's OWN keywords are bare single
           * words straight from the brief (بصل/onion, فلفل/pepper, فراولة/strawberry), so
           * "فلفل أسود" (a plain packaged dried spice, no processed-form marker to veto on)
           * and "زبادي بالفراولة" (strawberry YOGURT) matched those bullets and were pulled
           * into Fresh Produce; cat_canned_legumes' bare "عدس"/"فاصوليا" collided with dry,
           * by-weight legumes; cat_deli_salads' "حمص" is a genuine Arabic homograph (hummus
           * the dip vs. chickpeas the legume). None of that is fixable with a size/veto tweak
           * — those leaves' keyword sets are simply too generic to serve as a redirect TARGET
           * safely, so they are excluded by construction rather than chased one exception at a
           * time. The allowlist is intentionally short; each entry was hand-verified against
           * every one of its real redirects before being added — see classify.test.ts.
           */
          const crossDept = scores.find(
            (s) =>
              s.score >= 0.55 &&
              s.leafId !== leaf.id &&
              !s.genericOnly &&
              CROSS_DEPT_REDIRECT_TARGETS.has(s.leafId),
          );
          if (crossDept) {
            return finish(
              crossDept.leafId,
              Math.max(0.75, crossDept.score),
              'C',
              crossDept.matched,
              [leaf.id],
              false,
              `${winner.rule.note} → redirected across departments by an exact keyword match`,
            );
          }
        }

        const own = scores.find((s) => s.leafId === leaf.id);
        const matched = own?.genericOnly ? [] : own?.matched ?? [];
        const losing = scores.filter((s) => s.leafId !== leaf.id).slice(0, 2).map((s) => s.leafId);
        const ruleTags = [...(winner.rule.tags ?? [])];
        /*
         * A coarse rule still scores ABOVE the visibility threshold (0.78 vs 0.75). It came
         * from the grocer's own tree, so the DEPARTMENT is right and only the shelf is
         * uncertain — and hiding ~2,500 of 7,500 products for that would make a third of the
         * catalog invisible. The `review` flag still queues every one of them for a human.
         */
        return finish(
          leaf.id,
          winner.rule.review ? 0.78 : 0.9,
          'B',
          [...new Set([...matched, ...ruleTags])],
          losing,
          false,
          winner.rule.note,
        );
      }
    }
  }

  // ── Tier C: keyword match ──────────────────────────────────────────────────────────
  const scores = scoreLeaves(strippedAr, strippedEn, fullFolded);
  if (scores.length > 0) {
    const best = scores[0]!;
    const runnerUp = scores[1];
    // Tie → assign deterministically but STILL queue it. Silent mis-filing is the failure
    // mode worth designing against; a flagged guess is recoverable, a silent one is not.
    const ambiguous = !!runnerUp && Math.abs(runnerUp.score - best.score) < 1e-9;
    if (ambiguous) warnings.push('AMBIGUOUS_TIE');
    return finish(
      best.leafId,
      best.score,
      'C',
      best.matched,
      scores.slice(1, 3).map((s) => s.leafId),
      ambiguous,
    );
  }

  // ── Tier D: nothing ─────────────────────────────────────────────────────────────────
  // outOfScopeOnly is always false here — it already returned above — so this is a genuine
  // "no rule, no keyword" miss, headed for the review queue rather than dropped silently.
  return {
    leafId: '',
    confidence: 0,
    tier: 'C',
    ambiguous: false,
    matchedKeywords: [],
    losingLeaves: [],
    warnings: [...warnings, 'UNCLASSIFIED'],
    tags: [],
    outOfScope: false,
    discardedPaths,
  };
}

/** Disposition thresholds. Nothing half-confident is customer-visible. */
export const MIN_CONFIDENCE_VISIBLE = 0.75;
export const MIN_CONFIDENCE_ASSIGN = 0.4;

export function dispositionOf(r: ClassifyResult): 'assign' | 'assign-hidden' | 'skip' {
  if (r.outOfScope || !r.leafId) return 'skip';
  if (r.confidence >= MIN_CONFIDENCE_VISIBLE && !r.ambiguous) return 'assign';
  if (r.confidence >= MIN_CONFIDENCE_ASSIGN) return 'assign-hidden';
  return 'skip';
}
