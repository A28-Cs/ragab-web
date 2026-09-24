/**
 * chefaa category → Ragab taxonomy leaf mapping (§catalog import, stage 2 — chefaa source).
 *
 * Unlike HyperOne (classify.ts guesses a leaf from free-text names because HyperOne's own
 * category tree does not match Ragab's), every chefaa product already carries a clean
 * `level_one_category` + `level_two_category` pair from chefaa's own site — verified live
 * against every department page under https://chefaa.com/eg-ar on 2026-09-24. So this is a
 * direct, auditable lookup table, not a heuristic: Tier B in spirit (a source-path rule) but
 * exact rather than fuzzy, because the source path IS the classification.
 *
 * `db/taxonomy/taxonomy.ts`'s "chefaa" block defines the target leaves this table points to,
 * one array entry per (level_one slug, level_two slug) pair chefaa actually uses, plus one
 * "<department>-other" leaf per department for a product tagged only at the department level
 * (no level_two_category at all — real and common: chefaa's own "كل الأدوية" style landing
 * pages exist for exactly this reason).
 */

/** level_two_category.slug → leaf id. Covers every subcategory slug chefaa exposed live. */
export const LEVEL_TWO_TO_LEAF: Readonly<Record<string, string>> = {
  // الأدوية (Medications)
  'health-condition': 'cat_med_health_condition',
  'cough-cold-allergy': 'cat_med_cough_cold',
  'eye-ear-medications': 'cat_med_eye_ear',
  'kids-infant-medications': 'cat_med_kids',
  'stomach-bowel': 'cat_med_stomach',
  'pain-relief': 'cat_med_pain_relief',
  'skin-treatments': 'cat_med_skin',
  allergy: 'cat_med_allergy',

  // العناية بالشعر (Hair Care)
  'shampoo-conditioner': 'cat_hair_shampoo',
  'nourishment-treatment': 'cat_hair_treatment',
  'hair-styling-devices': 'cat_hair_styling',
  'hair-coloring': 'cat_hair_coloring',

  // العناية بالبشرة (Skin Care)
  cleansers: 'cat_skin_cleansers',
  moisturizers: 'cat_skin_moisturizers',
  serum: 'cat_skin_serum',
  masks: 'cat_skin_masks',
  'sun-care': 'cat_skin_sun',
  'eye-care': 'cat_skin_eye',

  // العناية اليومية (Daily Essentials)
  'bath-body-care': 'cat_daily_bath',
  'oral-care': 'cat_daily_oral',
  'feminine-care': 'cat_daily_feminine',
  'men-care': 'cat_daily_men',
  protection: 'cat_daily_protection',
  'natural-herbs-supplements': 'cat_daily_herbs',

  // الأم والطفل (Mom & Baby)
  'diapers-changing': 'cat_mombaby_diapers',
  'mommy-care': 'cat_mombaby_mommy',
  'baby-food-tools': 'cat_mombaby_food',
  'breastfeeding-care': 'cat_mombaby_breastfeeding',
  'bathing-baby-care': 'cat_mombaby_bathing',

  // المكياج والاكسسوارات (Makeup & Accessories)
  'makeup-face': 'cat_makeup_face',
  'makeup-eyes': 'cat_makeup_eyes',
  'makeup-eyelashes': 'cat_makeup_eyelashes',
  'makeup-lips': 'cat_makeup_lips',
  'makeup-nails': 'cat_makeup_nails',

  // المستلزمات الطبية (Health Care Devices)
  'pain-management': 'cat_devices_pain',
  'respiratory-equipments': 'cat_devices_respiratory',
  'first-aid-disposables': 'cat_devices_firstaid',
  'diabetic-management': 'cat_devices_diabetic',
  'weight-management': 'cat_devices_weight',
  incontinence: 'cat_devices_incontinence',
  'health-monitors': 'cat_devices_monitors',

  // الفيتامينات والمكملات (Vitamins & Supplements)
  'vitamins-minerals': 'cat_vitamins_minerals',
  supplements: 'cat_vitamins_supplements',
  slimming: 'cat_vitamins_slimming',

  // الصحة الجنسية (Sexual Wellness) — chefaa's own slug is spelled "sexual-welness"
  condom: 'cat_sexual_condom',
  'intimate-lubricants': 'cat_sexual_lubricants',
  'pregnancy-tests': 'cat_sexual_pregnancy',
  'performance-enhancers': 'cat_sexual_performance',
};

/**
 * level_one_category.slug → fallback leaf id, used only when a product has NO
 * level_two_category (an empty array — verified live: common, not an edge case) or when its
 * level_two slug is not (yet) in the table above.
 */
export const LEVEL_ONE_FALLBACK: Readonly<Record<string, string>> = {
  medications: 'cat_med_other',
  'hair-care': 'cat_hair_other',
  'skin-care': 'cat_skin_other',
  'daily-essentials': 'cat_daily_other',
  'mom-baby': 'cat_mombaby_other',
  'makeup-accessories': 'cat_makeup_other',
  'health-care-devices': 'cat_devices_other',
  'vitamins-supplements': 'cat_vitamins_other',
  'sexual-welness': 'cat_sexual_other',
  'pet-supplies': 'cat_pets_general',
  unclassified: 'cat_chefaa_other_general',
};

/** The final catch-all — a level_one slug this table has genuinely never seen. */
export const CHEFAA_UNMAPPED_LEAF = 'cat_chefaa_other_general';

export interface ChefaaClassification {
  leafId: string;
  /** True when this fell through to a department-level or global fallback, not an exact match. */
  fallback: boolean;
  /** level_three_category names, if any — carried as tags, never as a categories row. */
  level3TagsAr: string[];
  level3TagsEn: string[];
}

export function classifyChefaaCategories(
  levelOneSlug: string | null | undefined,
  levelTwoSlugs: readonly string[] | null | undefined,
  level3: ReadonlyArray<{ title_ar: string; title_en: string }> | null | undefined,
): ChefaaClassification {
  const level3TagsAr = (level3 ?? []).map((c) => c.title_ar).filter(Boolean);
  const level3TagsEn = (level3 ?? []).map((c) => c.title_en).filter(Boolean);

  for (const slug of levelTwoSlugs ?? []) {
    const leafId = LEVEL_TWO_TO_LEAF[slug];
    if (leafId) return { leafId, fallback: false, level3TagsAr, level3TagsEn };
  }

  const fallback = levelOneSlug ? LEVEL_ONE_FALLBACK[levelOneSlug] : undefined;
  return {
    leafId: fallback ?? CHEFAA_UNMAPPED_LEAF,
    fallback: true,
    level3TagsAr,
    level3TagsEn,
  };
}
