/**
 * Brand gazetteer (§catalog import, stage 2).
 *
 * HyperOne's `brand` and `manufacturer` attributes are NULL on every product probed, so brand
 * has to be recovered from the product NAME. That is not symmetric between the languages:
 *
 *   EN is brand-LEADING:      "Nestle Pure Life Water - 330ml"
 *   AR is descriptor-leading: "مياه طبيعية نستلة - 330مل"      ← brand TRAILS
 *
 * So a leading-token heuristic works for English and fails for Arabic. English brands are
 * recovered by leading-n-gram frequency; Arabic brands are recovered by this gazetteer first,
 * then by inference (group SKUs by their resolved English brand, take the longest common
 * Arabic substring present in ≥80% of the group).
 *
 * THE PAIRS BELOW WERE DERIVED FROM THE LIVE CATALOG, not invented — the frequency pass over
 * 8,506 real names produced them and they were then checked by eye. `support` is how many
 * products carried that brand at derivation time, so the list is ordered by how much each
 * entry actually moves.
 *
 * The inference guard that matters: a candidate Arabic brand is REJECTED when it appears in
 * the taxonomy's own vocabulary. The owner's ~590 bullets and 116 category names are a
 * ready-made Arabic category-noun stoplist, and using them caught real errors the raw
 * algorithm made — areon→"معطر هوا" (air freshener), ariel→"غسيل اتوماتيك" (automatic wash),
 * rhodes→"جبنه" (cheese), regina→"مكرونه" (pasta). Without it, those become brands.
 */

/**
 * English tokens that lead a product name but are NOT brands. Hand-curated: this list cannot
 * be derived, because the whole point is that these look exactly like brand candidates.
 *
 * Note `top` is here but `top value` is a REAL brand (HyperOne's private label, 310 products)
 * — which is why longest-match-wins is mandatory in the matcher.
 */
export const BRAND_STOPLIST: readonly string[] = [
  // Category nouns
  'water', 'milk', 'cheese', 'juice', 'tea', 'coffee', 'bread', 'rice', 'pasta', 'oil', 'ghee',
  'sugar', 'salt', 'flour', 'butter', 'cream', 'yoghurt', 'yogurt', 'eggs', 'egg', 'honey',
  'jam', 'sauce', 'soup', 'noodles', 'chips', 'biscuit', 'biscuits', 'chocolate', 'candy',
  'beef', 'chicken', 'meat', 'fish', 'shrimp', 'vegetables', 'fruits', 'nuts', 'spice',
  'spices', 'detergent', 'soap', 'shampoo', 'tissue', 'tissues', 'diapers', 'wipes',
  // Descriptors
  'fresh', 'natural', 'organic', 'premium', 'classic', 'original', 'special', 'select',
  'white', 'red', 'green', 'black', 'brown', 'blue', 'golden', 'gold', 'silver',
  'hot', 'cold', 'dark', 'light', 'sweet', 'salted', 'unsalted', 'instant', 'mixed',
  'frozen', 'dried', 'whole', 'low', 'full', 'extra', 'super', 'soft', 'hard', 'new',
  'large', 'small', 'mini', 'big', 'baby', 'kids', 'men', 'women', 'diet', 'zero', 'pure',
  // Particles and packaging
  'pack', 'set', 'with', 'and', 'for', 'the', 'of', 'in', 'box', 'bag', 'bottle', 'can',
  'al', 'el', 'abu', 'my', 'a', 'm', 'l', 'don', 'star', 'touch', 'tank', 'queen', 'motion',
  'fine', 'rich', 'deli', 'top', 'car', 'home', 'kitchen', 'plus', 'max', 'pro',
];

export interface BrandPair {
  en: string;
  ar: string;
  /** Products carrying this brand at derivation time — how much the entry moves. */
  support: number;
}

/**
 * Hand-verified core. Derived from the live catalog then read by eye; entries the derivation
 * got wrong were corrected or dropped rather than checked in.
 */
export const BRAND_PAIRS: readonly BrandPair[] = [
  { en: 'top value', ar: 'توب فاليو', support: 310 }, // HyperOne private label
  { en: 'ragab el attar', ar: 'رجب العطار', support: 197 },
  { en: 'hyperone', ar: 'هايبروان', support: 149 },
  { en: 'abu auf', ar: 'ابو عوف', support: 93 },
  { en: 'al doha', ar: 'الضحى', support: 93 }, // derivation gave 'ال'; corrected by hand
  { en: 'nilco', ar: 'نيلكو', support: 82 },
  { en: 'juhayna', ar: 'جهينة', support: 78 },
  { en: 'alkhatib', ar: 'الخطيب', support: 73 },
  { en: 'tornado', ar: 'تورنيدو', support: 57 },
  { en: 'domty', ar: 'دومتي', support: 52 },
  { en: 'dreem', ar: 'دريم', support: 49 }, // derivation gave 'در'; corrected
  { en: 'almarai', ar: 'المراعي', support: 46 },
  { en: 'pasabahce', ar: 'باشابهتشي', support: 44 },
  { en: 'black decker', ar: 'بلاك اند ديكر', support: 42 },
  { en: 'sonai', ar: 'سوناي', support: 40 },
  { en: 'isis', ar: 'ايزيس', support: 39 }, // derivation gave 'شا'; corrected
  { en: 'froots', ar: 'فروتس', support: 34 },
  { en: 'bestway', ar: 'بيست واي', support: 33 },
  { en: 'lamar', ar: 'لمار', support: 33 },
  { en: 'aaone', ar: 'ايه ايه وان', support: 31 },
  { en: 'delicia', ar: 'ديليسيا', support: 31 },
  { en: 'mienta', ar: 'ميانتا', support: 31 },
  { en: 'olivetta', ar: 'اوليفيتا', support: 30 },
  { en: 'lock lock', ar: 'لوك اند لوك', support: 29 },
  { en: 'nivea', ar: 'نيفيا', support: 28 },
  { en: 'wadi food', ar: 'وادي فود', support: 28 }, // derivation truncated to 'وادي فو'
  { en: 'fresh farm', ar: 'فريش فارم', support: 27 },
  { en: 'heinz', ar: 'هاينز', support: 27 },
  { en: 'l oreal paris', ar: 'لوريال باريس', support: 27 },
  { en: 'obour land', ar: 'عبور لاند', support: 27 },
  { en: 'zanussi', ar: 'زانوسي', support: 26 },
  { en: 'avanti', ar: 'افانتي', support: 25 },
  { en: 'ido', ar: 'اي دو', support: 25 },
  { en: 'rich bake', ar: 'ريتش بيك', support: 25 },
  { en: 'schweppes', ar: 'شويبس', support: 25 }, // derivation gave 'مشروب' (= drink); corrected
  { en: 'trueval', ar: 'تروفال', support: 25 },
  { en: 'tefal', ar: 'تيفال', support: 24 },
  { en: 'areon', ar: 'اريون', support: 24 }, // rejected by the noun guard; added by hand
  { en: 'clorox', ar: 'كلوركس', support: 23 },
  { en: 'el helal silver', ar: 'الهلال والنجمة', support: 23 },
  { en: 'elios', ar: 'اليوس', support: 23 },
  { en: 'royal', ar: 'رويال', support: 23 },
  { en: 'vitrac', ar: 'فيتراك', support: 23 },
  { en: 'glade', ar: 'جليد', support: 23 }, // noun guard rejected 'معطر جو'
  { en: 'mood', ar: 'موود', support: 22 },
  { en: 'sunsilk', ar: 'صانسيلك', support: 22 },
  { en: 'touch el zenouki', ar: 'تاتش الزنوكي', support: 22 },
  { en: 'danone', ar: 'دانون', support: 21 },
  { en: 'don lopez', ar: 'دون لوبيز', support: 21 },
  { en: 'kamena', ar: 'كامينا', support: 21 },
  { en: 'regina', ar: 'ريجينا', support: 23 }, // noun guard rejected 'مكرونه'
  { en: 'beko', ar: 'بيكو', support: 20 },
  { en: 'dina farms', ar: 'مزارع دينا', support: 20 },
  { en: 'nestle', ar: 'نستله', support: 20 },
  { en: 'oxi', ar: 'اوكسي', support: 20 }, // noun guard rejected 'غسيل'
  { en: 'zeina', ar: 'زينة', support: 21 }, // noun guard rejected 'مناديل'
  { en: 'el maleka', ar: 'الملكة', support: 19 },
  { en: 'elite', ar: 'ايليت', support: 19 },
  { en: 'maggi', ar: 'ماجي', support: 19 },
  { en: 'yassin', ar: 'ياسين', support: 19 },
  { en: 'ariel', ar: 'اريال', support: 18 }, // noun guard rejected 'غسيل اتوماتيك'
  { en: 'axe', ar: 'اكس', support: 18 },
  { en: 'atyab', ar: 'اطياب', support: 29 },
  { en: 'rhodes', ar: 'رودس', support: 15 },
  { en: 'baby joy', ar: 'بيبي جوي', support: 15 },
  { en: 'dove', ar: 'دوف', support: 26 },
  { en: 'garnier', ar: 'غارنييه', support: 26 },
  { en: 'palette', ar: 'باليت', support: 26 },
  { en: 'vatika', ar: 'فاتيكا', support: 44 },
  { en: 'knorr', ar: 'كنور', support: 29 },
  { en: 'hero', ar: 'هيرو', support: 28 },
  { en: 'halwani', ar: 'حلواني', support: 53 },
  { en: 'nescafe', ar: 'نسكافيه', support: 34 },
  { en: 'frida', ar: 'فريدا', support: 71 },
  { en: 'white point', ar: 'وايت بوينت', support: 44 },
  { en: 'lg', ar: 'ال جي', support: 28 },
  { en: 'samsung', ar: 'سامسونج', support: 38 },
  { en: 'sharp', ar: 'شارب', support: 27 },
  { en: 'haier', ar: 'هاير', support: 37 },
  { en: 'media tech', ar: 'ميديا تك', support: 31 },
  { en: 'persil', ar: 'برسيل', support: 14 },
  { en: 'tide', ar: 'تايد', support: 12 },
  { en: 'kiri', ar: 'كيري', support: 12 },
  { en: 'abou el walad', ar: 'أبو الولد', support: 10 },
  { en: 'beyti', ar: 'بيتي', support: 14 },
  { en: 'crystal', ar: 'كريستال', support: 12 },
  { en: 'hayat', ar: 'حياة', support: 10 },
  { en: 'lipton', ar: 'ليبتون', support: 12 },
  { en: 'el arosa', ar: 'العروسة', support: 14 },
  { en: 'pepsi', ar: 'بيبسي', support: 12 },
  { en: 'coca cola', ar: 'كوكاكولا', support: 14 },
  { en: 'chipsy', ar: 'شيبسي', support: 18 },
  { en: 'cadbury', ar: 'كادبوري', support: 12 },
  { en: 'galaxy', ar: 'جالاكسي', support: 10 },
  { en: 'corona', ar: 'كورونا', support: 12 },
  { en: 'bisco misr', ar: 'بيسكو مصر', support: 14 },
  { en: 'americana', ar: 'أمريكانا', support: 16 },
  { en: 'katilo', ar: 'كاتيلو', support: 10 },
  { en: 'edita', ar: 'إيديتا', support: 12 },
  { en: 'molto', ar: 'مولتو', support: 10 },
  { en: 'lactel', ar: 'لاكتيل', support: 10 },
  { en: 'president', ar: 'بريزيدون', support: 10 },
  { en: 'panda', ar: 'باندا', support: 10 },
  { en: 'greenland', ar: 'جرينلاند', support: 12 },
  { en: 'faragello', ar: 'فراجيلو', support: 12 },
  { en: 'best', ar: 'بست', support: 10 },
  { en: 'rabea', ar: 'ربيع', support: 10 },
  { en: 'twinings', ar: 'تويننجز', support: 8 },
  { en: 'signal', ar: 'سيجنال', support: 10 },
  { en: 'colgate', ar: 'كولجيت', support: 12 },
  { en: 'sensodyne', ar: 'سنسوداين', support: 8 },
  { en: 'gillette', ar: 'جيليت', support: 10 },
  { en: 'always', ar: 'أولويز', support: 12 },
  { en: 'pampers', ar: 'بامبرز', support: 12 },
  { en: 'molfix', ar: 'مولفكس', support: 10 },
  { en: 'fine', ar: 'فاين', support: 26 },
  { en: 'cerelac', ar: 'سيريلاك', support: 8 },
  { en: 'bebelac', ar: 'بيبيلاك', support: 8 },
  { en: 'whiskas', ar: 'ويسكاس', support: 8 },
  // Hardware / stationery / pet brands — added after a review pass surfaced them dragging
  // down confidence across cat_hw_electrical, cat_hw_household, cat_stat_office/writing and
  // cat_pet_food (unstripped brand names inflate the token count the confidence score divides
  // by). 'deli' is deliberately NOT reused from BRAND_STOPLIST (which excludes the common
  // English word "deli") — this is the Arabic transliteration of the Chinese stationery OEM,
  // looked up through the gazetteer path which never consults the stoplist.
  { en: 'varta', ar: 'فارتا', support: 21 },
  { en: 'energizer', ar: 'انرجايزر', support: 18 },
  { en: 'casio', ar: 'كاسيو', support: 5 },
  { en: 'deli', ar: 'ديلي', support: 124 },
  { en: 'm&g', ar: 'ام اند جي', support: 46 },
  { en: 'faber castell', ar: 'فابر كاستل', support: 8 },
  { en: 'yi plus', ar: 'واي بلس', support: 12 },
  { en: 'don canino', ar: 'دون كانينو', support: 8 },
  { en: 'holsum legends', ar: 'هولسم ليجيندز', support: 10 },
  { en: 'bimbo', ar: 'بيمبو', support: 9 },
];

/** Lookup by folded English brand → Arabic. Built once. */
export const BRAND_AR_BY_EN: ReadonlyMap<string, string> = new Map(
  BRAND_PAIRS.map((p) => [p.en, p.ar] as const),
);

/**
 * Arabic brand forms, LONGEST FIRST so `أبو الولد` is matched before `أبو` and
 * `توب فاليو` before any shorter substring.
 */
export const BRAND_AR_SORTED: readonly BrandPair[] = [...BRAND_PAIRS].sort(
  (a, b) => b.ar.length - a.ar.length,
);

/** English brand n-grams, longest first, for the leading-token matcher. */
export const BRAND_EN_SORTED: readonly BrandPair[] = [...BRAND_PAIRS].sort(
  (a, b) => b.en.length - a.en.length,
);
