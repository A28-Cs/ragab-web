/**
 * Classification engine (§catalog import).
 *
 * Golden cases, all taken from the live catalog or the committed CSVs. The most valuable ones
 * are the owner's hard rules (chilled vs frozen, fresh vs frozen vs canned) and the Arabic
 * orthography pins — both are silent-wrong-answer failure modes rather than crashes.
 */
import { describe, it, expect } from 'vitest';
import { classify, dispositionOf, normalizePath, stripBrandAndSize } from './classify';
import { parseSize } from '../normalize/units';
import { LEAVES } from '../../db/taxonomy';

/** Build a ClassifyInput the way the planner does, so tests exercise the real pipeline. */
function inputFor(nameAr: string, nameEn: string | null, paths: string[] = [], sku = '1234567890123') {
  const pa = parseSize(nameAr);
  const pe = nameEn ? parseSize(nameEn) : null;
  return {
    sku,
    nameAr,
    nameEn,
    descriptorAr: pa.descriptor,
    descriptorEn: pe?.descriptor ?? null,
    sourcePaths: paths,
  };
}

const leafOf = (nameAr: string, nameEn: string | null, paths: string[] = []) =>
  classify(inputFor(nameAr, nameEn, paths)).leafId;

describe('Arabic orthography — the two cases already committed in this repo', () => {
  it('matches زبادى (final ى) against the زبادي vocabulary', () => {
    // docs/products/زبادي.csv contains "زبادى كبير هايبروان" — final ى in a ي-named file.
    expect(leafOf('زبادى كبير هايبروان', null)).toBe('cat_dairy_yoghurt');
  });

  it('matches قهوه (plain ه) against the قهوة vocabulary', () => {
    // docs/products/"قهوه وبن وناسكفيه.csv" writes قهوة's taa marbuta as a plain ه.
    expect(leafOf('قهوه تركي ابو عوف - 200جم', null)).toBe('cat_bev_hot');
  });

  it('matches جبنة/جبنه interchangeably', () => {
    expect(leafOf('جبنة بيضاء دومتي - 500جم', null)).toBe('cat_dairy_cheese');
    expect(leafOf('جبنه بيضاء دومتي - 500جم', null)).toBe('cat_dairy_cheese');
  });

  it('handles the U+200F RLM that contaminates the source data', () => {
    expect(leafOf('‏جبنة بيضاء دومتي - 500جم', null)).toBe('cat_dairy_cheese');
  });
});

describe("owner rule 4 — chilled and frozen stay separate", () => {
  it('files frozen pizza under المجمدات even though بيتزا is a bakery word', () => {
    expect(leafOf('بيتزا مارجريتا مجمدة', null)).toBe('cat_frozen_ready');
  });

  it('files chilled cheese under الألبان, never المجمدات', () => {
    const leaf = LEAVES.get(leafOf('جبنة موزاريلا - 500جم', null))!;
    expect(leaf.parent.id).toBe('cat_dairy');
  });

  it('keeps frozen vegetables out of the fresh-produce tree', () => {
    const leaf = LEAVES.get(leafOf('بسلة مجمدة - 400جم', null))!;
    expect(leaf.parent.id).toBe('cat_frozen');
  });

  it('keeps fresh vegetables out of the frozen tree', () => {
    const leaf = LEAVES.get(leafOf('طماطم طازجة', null))!;
    expect(leaf.parent.id).toBe('cat_fresh');
  });

  it('does NOT treat مثلجة (iced) as frozen — iced coffee is a chilled drink', () => {
    // A bare 'مثلج' veto pushed every RTD iced coffee out of its correct leaf.
    expect(leafOf('قهوة مثلجة لاتيه نسكافيه - 220مل', null, ['coffee-tea/coffe'])).toBe('cat_bev_hot');
  });
});

describe('owner rule 5 — fresh, frozen and canned are three separate homes', () => {
  it('canned corn is not fresh produce', () => {
    const leaf = LEAVES.get(leafOf('ذرة معلبة - 400جم', null))!;
    expect(leaf.parent.id).not.toBe('cat_fresh');
  });

  it('mango juice is not fresh fruit', () => {
    const leaf = LEAVES.get(leafOf('عصير مانجو جهينة - 1 لتر', null))!;
    expect(leaf.parent.id).not.toBe('cat_fresh');
    expect(leaf.id).toBe('cat_bev_juices');
  });
});

describe('owner rules 2 and 3 — brand and size never decide a category', () => {
  it('strips the brand before matching', () => {
    const stripped = stripBrandAndSize('جبنة بيضاء دومتي - 500جم');
    expect(stripped).not.toContain('دومتي');
    expect(stripped).not.toContain('500');
  });

  it('strips sizes and multipacks', () => {
    const stripped = stripBrandAndSize('مياه نستله 330مل *20');
    expect(stripped).not.toContain('330');
    expect(stripped).not.toContain('20');
  });

  it('a product whose name is only a brand and a size is not classified by them', () => {
    const r = classify(inputFor('توب فاليو - 500جم', 'Top Value - 500g'));
    expect(r.leafId).toBe('');
  });
});

describe('owner rule 7 — exactly one primary category', () => {
  it('returns a single leafId, never a list', () => {
    const r = classify(inputFor('جبنة بيضاء - 500جم', null));
    expect(typeof r.leafId).toBe('string');
  });

  it('runner-up leaves become tags, not extra categories', () => {
    const r = classify(inputFor('زبادي بالفراولة - 100جم', null));
    expect(r.leafId).toBe('cat_dairy_yoghurt');
    // losingLeaves feeds tags; it never produces a second categoryId.
    expect(Array.isArray(r.losingLeaves)).toBe(true);
  });
});

describe('source-path rules (tier B)', () => {
  it('strips the branch-mirror suffix so 01SA mirrors collapse', () => {
    expect(normalizePath('Bakery 01SA')).toBe('bakery');
    expect(normalizePath('Vegetables 01EC')).toBe('vegetables');
    expect(normalizePath('beverages/water')).toBe('beverages/water');
  });

  it('uses the source tree in preference to the name', () => {
    const r = classify(inputFor('مياه معدنية', null, ['beverages/water']));
    expect(r.tier).toBe('B');
    expect(r.leafId).toBe('cat_bev_water');
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('drops out-of-scope products instead of queueing them for review', () => {
    const r = classify(inputFor('تليفزيون سامسونج 55 بوصة', null, ['electronics/tvs-home-theater']));
    expect(r.outOfScope).toBe(true);
    expect(dispositionOf(r)).toBe('skip');
  });

  it("drops a product whose ENTIRE source tree is out of scope, even when its name coincidentally matches a real keyword", () => {
    // Verified live: a Turkish coffee MAKER (an appliance, under electronics/kitchen-appliances)
    // was being rescued into Hot Beverages because "قهوة" (coffee) matched. The source tree's
    // own verdict must win over an incidental name match — 312 of 7,111 planned rows were
    // exactly this failure before the fix.
    const r = classify(
      inputFor('ماكينة قهوة تركي تورنيدو - 8 اكواب', null, [
        'electronics',
        'electronics/kitchen-appliances/coffee-machines',
        'electronics/kitchen-appliances',
      ]),
    );
    expect(r.outOfScope).toBe(true);
    expect(dispositionOf(r)).toBe('skip');
  });

  it('drops an out-of-scope product even when a keyword match would have scored high', () => {
    // An air conditioner's descriptor tokens (أبيض = white, بارد = cold) happened to satisfy
    // Hair Care's keyword set; the source tree says electronics throughout.
    const r = classify(
      inputFor('تكييف سبليت تورنيدو - 1.5 حصان - بارد وساخن - أبيض', null, [
        'electronics',
        'electronics/large-appliances/air-conditioners',
        'electronics/large-appliances',
      ]),
    );
    expect(r.outOfScope).toBe(true);
  });

  it('drops a product whose only in-scope-looking path is a promo grouping', () => {
    // exclusive-deals is a promo shelf, not a department.
    const r = classify(inputFor('منتج عرض', null, ['exclusive-deals/unilever-deals']));
    expect(r.outOfScope).toBe(true);
  });

  it('prefers a real department over a promo grouping when a product is in both', () => {
    const r = classify(
      inputFor('سائل غسيل أطباق فيري', null, [
        'exclusive-deals/unilever-deals',
        'cleaning-household/dishwashing',
      ]),
    );
    expect(r.leafId).toBe('cat_clean_dish');
  });

  it('falls through to the next candidate when the best rule is vetoed', () => {
    // A frozen turkey is under both frozens/frozen-poultry and butchery-poultry/poultry; the
    // latter sorts first but is a chilled leaf, so it must be skipped rather than give up.
    const r = classify(
      inputFor('ديك رومي مجمد - بالوزن', null, [
        'butchery-poultry/poultry',
        'frozens/frozen-poultry',
      ]),
    );
    expect(LEAVES.get(r.leafId)?.parent.id).toBe('cat_frozen');
  });

  it('lets a coarse rule defer to a more specific sibling', () => {
    // food-cupboard/canned-food spans 8.1-8.4; tuna must reach cat_canned_fish, not the
    // generic ready-meals leaf, or that leaf stays permanently empty.
    const r = classify(inputFor('تونة خفيفة في زيت الصويا - 140جم', null, ['food-cupboard/canned-food']));
    expect(r.leafId).toBe('cat_canned_fish');
  });

  it('does NOT let a bare generic sibling match override the source-path rule', () => {
    // dairy/yogurt-drinks-rayeb is source-ruled to cat_dairy_yoghurt (review: true, straddles
    // زبادي للشرب). cat_dairy_milk's matchAlso contains the bare, generic token 'لبن' — every
    // rayeb product's own name — which used to satisfy the sibling-refinement threshold on
    // nothing but that generic match and silently move rayeb out of Yoghurt into Milk.
    const r = classify(inputFor('لبن رايب جهينه - 220جم', null, ['dairy/yogurt-drinks-rayeb']));
    expect(r.leafId).toBe('cat_dairy_yoghurt');
  });

  describe('cross-department redirect for a genuinely mixed source department', () => {
    it('redirects rice sold at an attar (spice) shop to Rice, not Spices', () => {
      // Verified live: HyperOne's herbs-spices-hub also lists rice sold by weight under the
      // same coarse path as actual spices.
      const r = classify(
        inputFor('أرز بسمتي رجب العطار- بالوزن', null, ['herbs-spices-hub', 'herbs-spices-hub/ragab-el-attar']),
      );
      expect(r.leafId).toBe('cat_grains_rice');
    });

    it('redirects nuts sold at an attar shop to Nuts & Seeds, not Spices', () => {
      const r = classify(inputFor('بندق أبو عوف – بالوزن', null, ['herbs-spices-hub', 'herbs-spices-01sa']));
      expect(r.leafId).toBe('cat_snacks_nuts');
    });

    it('redirects a finished oriental sweet out of Baking Supplies', () => {
      // food-cupboard/baking-ingredients also carries ready-to-eat basbousa, not just mix
      // ingredients (vanilla, food colouring, baking powder).
      const r = classify(inputFor('بسبوسة توب فاليو - 400جم', null, ['food-cupboard/baking-ingredients']));
      expect(r.leafId).toBe('cat_conf_oriental');
    });

    it('does NOT redirect a spice blend that merely mentions rice in passing', () => {
      // "توابل أرز" (rice seasoning) only matches the bare, generic "ارز" token — the redirect
      // requires an exact owner-authored bullet, not an incidental generic-noun hit, or every
      // rice-adjacent spice blend would wrongly leave the spice department.
      const r = classify(inputFor('توابل أرز الخطيب - بالوزن', null, ['herbs-spices-hub']));
      expect(r.leafId).toBe('cat_spices_blends');
    });

    it('does NOT redirect onion/garlic/pepper POWDER or GROUND spice to Fresh Produce', () => {
      // Real regression, caught live: cat_fresh_veg's own keywords are bare single words
      // straight from the brief (بصل/onion, ثوم/garlic, فلفل/pepper) with no processed-form
      // guard, so "بصل بودر" (onion powder), "زيت ثوم" (garlic oil) and "فلفل أسود مطحون"
      // (ground black pepper) — none of them produce — all matched those bare bullets and
      // got redirected to Fresh Produce once cross-department redirects existed.
      expect(classify(inputFor('بصل بودر رجب العطار', null, ['herbs-spices-hub'])).leafId).not.toBe('cat_fresh_veg');
      expect(classify(inputFor('زيت ثوم الخطيب - 30مل', null, ['herbs-spices-hub'])).leafId).not.toBe('cat_fresh_veg');
      expect(classify(inputFor('فلفل أسود مطحون الخطيب', null, ['herbs-spices-hub'])).leafId).not.toBe('cat_fresh_veg');
    });

    it('never redirects into fresh produce at all — its own keywords are too generic to be a safe target', () => {
      // cat_fresh_veg/fruit/herbs are deliberately absent from the redirect allowlist: their
      // keywords are bare single words straight from the brief (بصل, فلفل, فراولة, ...), which
      // collide too often with an unrelated meaning (a dried spice, a yogurt flavour) to serve
      // safely as a cross-department target. Confirmed by testing the case that DID regress
      // live before the allowlist existed — a coarse spice-shop rule seeing plain "بصل".
      const r = classify(inputFor('بصل بلدي بالوزن', null, ['herbs-spices-hub']));
      expect(r.leafId).not.toBe('cat_fresh_veg');
    });

    it('never redirects fruit-flavoured yogurt into Fresh Fruit', () => {
      // Real regression, caught live: "زبادي بالفراولة" (strawberry yogurt) matched Fresh
      // Fruit's bare "فراولة" bullet and was pulled out of dairy entirely.
      const r = classify(inputFor('زبادي بالفراولة المراعي - 105جم', null, ['dairy/yogurts-puddings']));
      expect(r.leafId).not.toBe('cat_fresh_fruit');
    });
  });
});

describe('tags', () => {
  it('never emits an empty tag list', () => {
    const r = classify(inputFor('مياه معدنية', null, ['beverages/water']));
    expect(r.tags.length).toBeGreaterThan(0);
  });

  it('adds cross-cutting facets that matched', () => {
    const r = classify(inputFor('لبن خالي الدسم جهينة - 1 لتر', null, ['dairy/fresh-milk']));
    expect(r.tags).toContain('خالي الدسم');
  });

  it('never emits a tag equal to a top-level department name', () => {
    const r = classify(inputFor('عصير مانجو - 1 لتر', null, ['beverages/juice']));
    expect(r.tags).not.toContain('المشروبات');
  });

  it('does not tag generic head nouns — the tag vocabulary stays the owner’s words', () => {
    // 'زيت' is a matchAlso entry, not one of the brief's bullets, so it must not be a tag.
    const r = classify(inputFor('زيت حار تشويس - 250مل', null));
    expect(r.leafId).toBe('cat_oils_oil');
    expect(r.tags).not.toContain('زيت');
  });
});

describe('disposition', () => {
  it('hides a low-confidence assignment rather than showing a guess', () => {
    const r = { confidence: 0.5, ambiguous: false, outOfScope: false, leafId: 'cat_bev_water' };
    expect(dispositionOf(r as never)).toBe('assign-hidden');
  });

  it('hides an ambiguous tie even at a high score', () => {
    const r = { confidence: 0.85, ambiguous: true, outOfScope: false, leafId: 'cat_bev_water' };
    expect(dispositionOf(r as never)).toBe('assign-hidden');
  });

  it('skips anything with no leaf — categoryId is NOT NULL, there is no parking space', () => {
    const r = { confidence: 0, ambiguous: false, outOfScope: false, leafId: '' };
    expect(dispositionOf(r as never)).toBe('skip');
  });
});
