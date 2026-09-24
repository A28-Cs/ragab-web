/**
 * Cross-cutting facets, veto vocabularies and the unit lexicon (§catalog import).
 *
 * These token sets mechanize the owner's hard organizational rules. They are shared by the
 * classifier's `requireAny`/`forbidAny` guards so a rule is stated ONCE and applied in both
 * directions — a chilled leaf forbids the frozen tokens, a frozen leaf requires them.
 *
 * Every token here is already FOLDED (see normalize.ts fold()): ة→ه, ى→ي, أإآ→ا. Write them
 * folded so no runtime folding of the vocabulary is needed, and taxonomy.test.ts asserts it.
 */

/**
 * Owner rule 4 + 5: "المبرد والمجمد منفصلان" and "الطازج يجب أن يكون مستقلًا".
 *
 * Chilled and ambient leaves carry `forbidAny: FREEZER_TOKENS`, so `بيتزا مجمدة` can never
 * land in a chilled bakery leaf even though `بيتزا` keyword-matches there. Frozen leaves
 * carry `requireAny: FREEZER_TOKENS` — waived when a source-path rule already decided,
 * because the source tree is stronger evidence than the product name.
 */
export const FREEZER_TOKENS: readonly string[] = [
  'مجمد',
  'مجمده',
  // 'مثلج' (bare) is deliberately ABSENT. It reads as "iced", not "frozen", and vetoed real
  // chilled ready-to-drink products out of their correct leaves — قهوة مثلجة (iced coffee),
  // مشروب توت مثلج (iced berry drink). 'مثلجات' (frozen desserts) is kept and still matches
  // مثلجات عصا.
  'مثلجات',
  'فروزن',
  'ايس كريم',
  'ايسكريم',
  'frozen',
  'ice cream',
  'icecream',
];

/** Shelf-stable preservation — keeps canned goods out of the fresh and chilled trees. */
export const CANNED_TOKENS: readonly string[] = [
  'معلب',
  'معلبه',
  'معلبات',
  'محفوظ',
  'مجفف',
  'مجففه',
  'canned',
  'tinned',
  'dried',
  'preserved',
];

/**
 * Processed forms that disqualify a raw-produce leaf (owner rule 5). Includes the freezer
 * tokens: "الطازج يجب أن يكون مستقلًا" means fresh produce must reject frozen vegetables as
 * firmly as it rejects canned ones — they are different departments with different storage.
 */
export const PROCESSED_PRODUCE_TOKENS: readonly string[] = [
  ...FREEZER_TOKENS,
  ...CANNED_TOKENS,
  'عصير',
  'عصاير', // pre-folded: عصائر → عصاير (ئ → ي)
  'juice',
  'مربي',
  'jam',
  'مخلل',
  'مخللات',
  'pickled',
  'pickles',
  /*
   * Dried/powdered/pressed forms of a raw ingredient. Several fresh-produce leaves' own
   * keywords are BARE single words (بصل/onion, ثوم/garlic, فلفل/pepper — straight from the
   * owner's brief), so without this veto, "بصل بودر" (onion POWDER), "فلفل أسود مطحون"
   * (ground black PEPPER) and "زيت ثوم" (garlic OIL) — all spices/condiments, none of them
   * produce — matched those bare bullets and were classified as fresh vegetables. Verified
   * live: this was a real regression once cross-department keyword redirects were introduced.
   */
  'بودر',
  'بودره',
  'مطحون',
  'مطحونه',
  'زيت',
  'معجون',
  'powder',
  'powdered',
  // NOT 'oil' or 'ground' as bare English tokens — isVetoed matches by SUBSTRING, and both
  // are common substrings of unrelated words ("foil", "boiler") once folded/lowercased; the
  // Arabic tokens above already cover the real cases in this predominantly-Arabic catalog.
];

/**
 * Facet tags applied whenever they match, on top of the leaf's own matched keywords.
 * These are the cross-cutting attributes the owner wants reachable via search/filters
 * without duplicating a product into a second category (owner rule 8).
 *
 * Key = the tag stored on the product (readable Arabic, display-facing).
 * Value = folded tokens that trigger it, in either language.
 */
export const FACET_TAGS: ReadonlyArray<{ tag: string; tokens: readonly string[] }> = [
  { tag: 'مبرد', tokens: ['مبرد', 'مبرده', 'chilled'] },
  { tag: 'مجمد', tokens: [...FREEZER_TOKENS] },
  { tag: 'طازج', tokens: ['طازج', 'طازجه', 'بلدي', 'fresh'] },
  { tag: 'معلب', tokens: [...CANNED_TOKENS] },
  { tag: 'عضوي', tokens: ['عضوي', 'عضويه', 'اورجانيك', 'organic'] },
  { tag: 'دايت', tokens: ['دايت', 'diet', 'light', 'لايت', 'خفيف'] },
  { tag: 'بدون سكر', tokens: ['بدون سكر', 'خالي من السكر', 'sugar free', 'no sugar', 'zero sugar'] },
  { tag: 'خالي من الجلوتين', tokens: ['خالي من الجلوتين', 'gluten free'] },
  { tag: 'خالي من اللاكتوز', tokens: ['خالي من اللاكتوز', 'lactose free'] },
  { tag: 'كامل الدسم', tokens: ['كامل الدسم', 'full cream', 'full fat', 'whole'] },
  { tag: 'خالي الدسم', tokens: ['خالي الدسم', 'خالي من الدسم', 'skimmed', 'zero fat', 'fat free'] },
  { tag: 'للأطفال', tokens: ['اطفال', 'للاطفال', 'بيبي', 'baby', 'kids', 'children'] },
  { tag: 'عبوة عائلية', tokens: ['عايلي', 'عايليه', 'family', 'family pack'] },
  { tag: 'اقتصادي', tokens: ['اقتصادي', 'اقتصاديه', 'وفر', 'value pack', 'economy'] },
  { tag: 'رمضان', tokens: ['رمضان', 'ramadan'] },
  { tag: 'كاشير', tokens: ['جيب', 'فردي', 'فرديه', 'pocket', 'single serve'] },
];

/**
 * Owner rule 3: "الأحجام ليست أقسامًا". Stripped from a product name BEFORE keyword
 * matching, so a size token can never be what decides a category. Also asserted against
 * every category name in taxonomy.test.ts, so the rule cannot rot back in later.
 *
 * Matches the shapes actually present in the source: `- 500مل`, `- 1لتر * 6 قطع`,
 * `- 30 بيضة`, `- 50 فتلة`, `- 8 قطع`, `330ml x 20 Bottles`, `-19L`.
 */
/*
 * NOTE the trailing `(?![\p{L}\p{N}])` rather than `\b`. JavaScript's `\b` is defined over
 * ASCII word characters, so it NEVER matches after an Arabic letter — `/\d+\s*مل\b/` cannot
 * match "330مل " at all. Using `\b` here silently disabled Arabic size-stripping entirely,
 * which let size digits reach keyword matching. Verified by classify.test.ts.
 */
export const SIZE_RE =
  /\d+(?:[.,]\d+)?\s*(?:جم|جرام|غرام|كجم|كج|كيلو|كيلوجرام|مجم|مل|ملي|مللي|ملليلتر|لتر|ل|قطعه|قطعة|قطع|حبه|حبة|بيضه|بيضة|فتله|فتلة|كيس|علبه|علبة|زجاجه|زجاجة|عبوه|عبوة|رغيف|شريحه|شريحة|رول|لفه|لفة|ظرف|جالون|لون|قلم|kgs?|kg|gms?|gr|grams?|g|mls?|ml|cc|cl|ltrs?|lt|liters?|litres?|l|oz|pcs?|pieces?|pack|bottles?|cans?|sachets?|rolls?|eggs?)(?![\p{L}\p{N}])/giu;

/** The multipack form: `1لتر * 6`, `330ml x 20`, `6×1.5`. */
export const MULTIPACK_RE = /\d+\s*[x×*]\s*\d+/gi;

/** `unitMeasure` is a closed enum in modules/catalog/schema.ts variantUpsertSchema. */
export type UnitMeasure = 'L' | 'ml' | 'kg' | 'g' | 'pc';

/**
 * Unit lexicon, longest-token-first. THE ORDER MATTERS: `كجم` must be tried before `كج`
 * before `ج`, or `1 كجم` parses as `1 ك` plus junk. The array is sorted by descending
 * token length at module load and taxonomy.test.ts asserts that invariant holds.
 *
 * `mg` folds to `g` and `جالون` to `pc` because the enum has no wider vocabulary.
 */
export const UNIT_LEXICON: ReadonlyArray<{ tokens: readonly string[]; measure: UnitMeasure }> = [
  { tokens: ['ملليلتر', 'مللي', 'ملي', 'مل', 'millilitre', 'milliliter', 'ml', 'cc'], measure: 'ml' },
  { tokens: ['سنتيلتر', 'cl'], measure: 'ml' },
  // 'ك' and 'k' are the catalog's own shorthand for kilo — "زبادي جهينه - 5ك", "Vermicelli - 1k".
  // Safe despite being single characters because the matcher requires a digit before and a
  // non-letter after, and longest-first ordering means كجم/كيلو are tried first.
  { tokens: ['كيلوجرام', 'كيلوغرام', 'كيلو', 'كجم', 'كج', 'ك', 'kilogram', 'kilo', 'kgs', 'kg', 'k'], measure: 'kg' },
  { tokens: ['ملليجرام', 'مليجرام', 'مجم', 'milligram', 'mg'], measure: 'g' },
  { tokens: ['جرامات', 'جرام', 'غرام', 'جم', 'grams', 'gram', 'gms', 'gm', 'gr', 'g'], measure: 'g' },
  { tokens: ['لتر', 'لتره', 'litres', 'litre', 'liters', 'liter', 'ltrs', 'ltr', 'lt', 'l'], measure: 'L' },
  {
    tokens: [
      'قطعه', 'قطعة', 'قطع', 'حبه', 'حبة', 'حبات', 'بيضه', 'بيضة', 'بيضات', 'فتله', 'فتلة',
      'اكياس', 'كيس', 'علبه', 'علبة', 'عُلب', 'علب', 'زجاجه', 'زجاجة', 'زجاجات', 'عبوه', 'عبوة',
      'رغيف', 'شريحه', 'شريحة', 'لفه', 'لفة', 'رول', 'ظرف', 'مظروف', 'فرد', 'مثلثات', 'جالون',
      'حفاضه', 'حفاضة', 'حفاضات', 'diapers', 'nappies',
      'pieces', 'piece', 'pcs', 'pc', 'bottles', 'bottle', 'cans', 'can', 'sachets', 'sachet',
      'rolls', 'roll', 'bags', 'bag', 'eggs', 'egg', 'loaf', 'pack', 'gallon',
      // Count nouns: "12 لون" (12 colours), "12 قلم" (12 pens) are counts, not measures.
      'لون', 'الوان', 'قلم', 'اقلام', 'ورقه', 'ورقة', 'فوطه', 'فوطة', 'منديل',
      'colors', 'colours', 'pencils', 'pens', 'sheets', 'towels', 'wipes', 'tablets', 'capsules',
    ],
    measure: 'pc',
  },
];

/** Flattened, longest-first, for building a safe alternation. Built once. */
export const UNIT_TOKENS_SORTED: ReadonlyArray<{ token: string; measure: UnitMeasure }> =
  UNIT_LEXICON.flatMap((e) => e.tokens.map((token) => ({ token, measure: e.measure }))).sort(
    (a, b) => b.token.length - a.token.length,
  );

/** Container nouns: recorded for the display string, never used as the measure. */
export const CONTAINER_NOUNS: readonly string[] = [
  'زجاجه', 'زجاجة', 'زجاجات', 'علبه', 'علبة', 'علب', 'كيس', 'اكياس', 'عبوه', 'عبوة',
  'قطعه', 'قطعة', 'قطع', 'bottles', 'bottle', 'cans', 'can', 'bags', 'bag', 'pieces', 'pcs',
];
