/**
 * Source-path → Ragab-leaf rules (§catalog import, stage 3 tier B).
 *
 * These map HyperOne's OWN category tree onto the owner's taxonomy, and they are the primary
 * classification signal. HyperOne's tree is already curated by a real grocer, so a path rule
 * is far stronger evidence than keyword matching on a product name — and, unlike a
 * heuristic, a rule is reviewable: a human can read this file and check the mapping.
 *
 * Built from the LIVE tree (289 nodes, fetched and inspected, not guessed). Product counts in
 * the notes are from that fetch and are there to show how much each rule moves.
 *
 * DELIBERATE OMISSIONS. Where a HyperOne category is a genuine MIX of two Ragab leaves,
 * there is NO rule, so the product falls through to tier-C keyword matching which splits it
 * correctly. `food-cupboard/sugar-salt` is the clearest case: سكر → cat_baking_sugar and
 * ملح → cat_spices_basic, and a path rule could only ever get one of them right. Same for
 * `food-cupboard/oils-ghee` (زيت vs سمن) and the 592-product mixed bag
 * `office-school-supplies-pet-food-garden-01sa`.
 *
 * `review: true` marks a rule that is deliberately coarse — its products are still queued for
 * a human even though they were confidently assigned.
 */
import { OUT_OF_SCOPE, type SourceRule } from './types';

/** Branch-mirror suffix: `Bakery 01SA` ≡ `Bakery`, `Vegetables 01EC` ≡ `Vegetables`. */
export const BRANCH_MIRROR_RE = /\s+\d{2}[a-z]{2}$/i;

export const SOURCE_RULES: readonly SourceRule[] = [
  /* ═══ 1. المشروبات ═══════════════════════════════════════════════════════════════ */
  { match: { path: 'beverages/water' }, target: 'cat_bev_water', note: '21 products' },
  { match: { path: 'beverages/sparkling-water' }, target: 'cat_bev_water', tags: ['عبوات مياه غازية'], note: '7 — the brief lists sparkling water under 1.1 المياه' },
  { match: { path: 'beverages/soft-drinks' }, target: 'cat_bev_carbonated', note: '125' },
  { match: { path: 'beverages/juice' }, target: 'cat_bev_juices', note: '134' },
  { match: { path: 'beverages/fresh-juice' }, target: 'cat_bev_juices', tags: ['عصائر طبيعية مبردة'], note: '36 — عصائر فريش' },
  { match: { path: 'beverages/syrups' }, target: 'cat_bev_juices', tags: ['عصائر مركزة'], note: '20 — شراب مركز' },
  { match: { path: 'beverages/powdered-drinks' }, target: 'cat_bev_juices', tags: ['عصائر بودرة'], note: '17' },
  { match: { path: 'beverages/energy-drinks' }, target: 'cat_bev_energy', note: '22' },
  // Hot drinks live in their own HyperOne department, not under beverages.
  { match: { prefix: 'coffee-tea/coffe' }, target: 'cat_bev_hot', tags: ['قهوة'], note: '163 — coffee' },
  { match: { path: 'coffee-tea/hot-tea' }, target: 'cat_bev_hot', tags: ['شاي'], note: '46' },
  { match: { path: 'coffee-tea/herbal-tea' }, target: 'cat_bev_hot', tags: ['مشروبات أعشاب'], note: '59' },
  { match: { path: 'coffee-tea/cocoa' }, target: 'cat_bev_hot', tags: ['هوت شوكليت'], note: '12' },

  /* ═══ 2. الألبان ومنتجات الثلاجة ═════════════════════════════════════════════════ */
  { match: { path: 'dairy/fresh-milk' }, target: 'cat_dairy_milk', tags: ['لبن مبستر'], note: '20' },
  { match: { path: 'dairy/long-life-milk' }, target: 'cat_dairy_milk', tags: ['لبن طويل الأجل'], note: '40' },
  { match: { path: 'dairy/flavored-milk' }, target: 'cat_dairy_milk', tags: ['لبن منكّه'], note: '15' },
  { match: { path: 'dairy/powdered-milk' }, target: 'cat_dairy_milk', tags: ['لبن بودرة'], note: '19 — the brief has no powdered-milk bullet; filed under اللبن and tagged' },
  { match: { path: 'dairy/yoghurt' }, target: 'cat_dairy_yoghurt', tags: ['زبادي طبيعي'], note: '30' },
  { match: { path: 'dairy/greek-yogurt' }, target: 'cat_dairy_yoghurt', tags: ['زبادي يوناني'], note: '31' },
  { match: { path: 'dairy/yogurts-puddings' }, target: 'cat_dairy_yoghurt', tags: ['زبادي فواكه'], note: '34 — زبادي نكهات وبودينج', review: true },
  { match: { path: 'dairy/yogurt-drinks-rayeb' }, target: 'cat_dairy_yoghurt', tags: ['زبادي للشرب', 'لبن رايب'], note: '39 — straddles 2.2 زبادي للشرب and 2.5 لبن رايب', review: true },
  { match: { path: 'dairy/cream' }, target: 'cat_dairy_cream', note: '26 — Cream & Labneh' },
  { match: { path: 'dairy/ghee-butter' }, target: 'cat_dairy_butter', note: '16' },
  { match: { path: 'dairy-eggs-cheese/cheese' }, target: 'cat_dairy_cheese', note: '176 — branded cheese' },
  { match: { path: 'dairy-eggs-cheese/fresh-cheese' }, target: 'cat_dairy_cheese', note: '41' },
  { match: { path: 'dairy-eggs-cheese/eggs' }, target: 'cat_dairy_eggs', note: '9' },
  { match: { prefix: 'cheese-01sa' }, target: 'cat_dairy_cheese', note: '157 — branch mirror of Cheese' },
  // Two HyperOne categories that sit under Eggs & Cheese but are not dairy at all.
  { match: { path: 'dairy-eggs-cheese/weighted-pickles' }, target: 'cat_groc_pickles', note: '30 — مخلل بالوزن, not dairy' },
  { match: { path: 'dairy-eggs-cheese/weighted-halawa' }, target: 'cat_breakfast_essentials', tags: ['حلاوة طحينية'], note: '14 — حلاوة بالوزن, not dairy' },

  /* ═══ 3. اللحوم المبردة والدليكاتيسن ═════════════════════════════════════════════ */
  { match: { prefix: 'cold-cuts-deli' }, target: 'cat_deli_processed', note: '69 — لحوم باردة' },
  /*
   * GAP IN THE BRIEF: fresh butchery, poultry and fish have no section of their own in the
   * owner's 25. ~150 products. Filed into the nearest chilled leaf and flagged for review so
   * the owner can decide whether to add a "اللحوم والدواجن الطازجة" department.
   */
  { match: { path: 'butchery-poultry/meat' }, target: 'cat_deli_ready', tags: ['لحوم طازجة'], note: '24 — GAP: no fresh-butchery section in the brief', review: true },
  { match: { path: 'butchery-poultry/poultry' }, target: 'cat_deli_ready', tags: ['دواجن طازجة'], note: '35 — GAP: no fresh-poultry section', review: true },
  { match: { prefix: 'poultry-01sa' }, target: 'cat_deli_ready', tags: ['دواجن طازجة'], note: '38 — branch mirror', review: true },
  { match: { prefix: 'meat-poultry-01sa' }, target: 'cat_deli_ready', tags: ['لحوم طازجة'], note: '24 — branch mirror', review: true },
  { match: { prefix: 'seafood' }, target: 'cat_deli_ready', tags: ['أسماك طازجة'], note: '30 — GAP: no fresh-fish section (13.5 is FROZEN seafood)', review: true },

  /* ═══ 4. المخبوزات والخبز ════════════════════════════════════════════════════════ */
  { match: { path: 'bakery/balady-shamy-bread' }, target: 'cat_bakery_bread', tags: ['خبز بلدي', 'خبز شامي'], note: '24' },
  { match: { path: 'bakery/soft-bread' }, target: 'cat_bakery_bread', tags: ['عيش فينو', 'خبز برجر'], note: '27' },
  { match: { path: 'bakery/toast' }, target: 'cat_bakery_bread', tags: ['عيش توست'], note: '16' },
  { match: { path: 'bakery/pastries' }, target: 'cat_bakery_pastries', note: '42 — معجنات' },
  { match: { path: 'bakery/tarts-cakes' }, target: 'cat_bakery_cakes', note: '42' },
  { match: { path: 'snacks-sweets/cakes' }, target: 'cat_bakery_cakes', note: '53 — packaged cake' },
  { match: { path: 'bakery/ramadan-oriental-desserts' }, target: OUT_OF_SCOPE, note: '19 → 12.4, not bakery — removed by owner request 2026-09-14' },
  { match: { path: 'bakery/crackers' }, target: OUT_OF_SCOPE, note: '7 → 11.2, not bakery — removed by owner request 2026-09-14' },
  { match: { prefix: 'bakery-01sa' }, target: 'cat_bakery_bread', note: '188 — branch mirror, bread-dominant', review: true },

  /* ═══ 5. الحبوب والأرز والمكرونة والبقوليات ══════════════════════════════════════ */
  { match: { path: 'food-cupboard/rice' }, target: 'cat_grains_rice', note: '44' },
  { match: { path: 'food-cupboard/pasta' }, target: 'cat_grains_pasta', note: '169' },
  { match: { path: 'food-cupboard/beans-grains' }, target: 'cat_grains_legumes', note: '57 — mixes 5.3 حبوب and 5.4 بقوليات', review: true },

  /* ═══ 6. الدقيق والسكر ومستلزمات الخبز ═══════════════════════════════════════════ */
  // review:true so the sibling-refinement can pull دقيق out into 6.1 and سكر into 6.2.
  { match: { path: 'food-cupboard/baking-ingredients' }, target: 'cat_baking_supplies', note: '98 — spans 6.1-6.3', review: true },
  // NO rule for food-cupboard/sugar-salt (50): tier C splits سكر → 6.2 and ملح → 9.1.

  /* ═══ 7. الزيوت والسمن والصلصات ══════════════════════════════════════════════════ */
  // NO rule for food-cupboard/oils-ghee (84): tier C splits زيت → 7.1 and سمن → 7.2.
  { match: { path: 'food-cupboard/sauces' }, target: 'cat_oils_sauces', note: '84' },
  { match: { path: 'food-cupboard/vinegar' }, target: 'cat_oils_vinegar', note: '17' },

  /* ═══ 8. المعلبات والمحفوظات ═════════════════════════════════════════════════════ */
  { match: { path: 'food-cupboard/canned-food' }, target: 'cat_canned_ready', note: '75 — spans 8.1-8.4', review: true },
  { match: { path: 'food-cupboard/pastes' }, target: 'cat_canned_ready', tags: ['معجون طماطم'], note: '26 — صلصة' },
  { match: { path: 'food-cupboard/jams-honey-spreads' }, target: 'cat_canned_jam', note: '131' },

  /* ═══ 9. التوابل والأعشاب ════════════════════════════════════════════════════════ */
  { match: { path: 'food-cupboard/herbs-spices' }, target: 'cat_spices_basic', note: '147 — spans 9.1-9.3', review: true },
  { match: { prefix: 'herbs-spices-01sa' }, target: 'cat_spices_basic', note: '291 — عطارة branch mirror', review: true },
  { match: { prefix: 'herbs-spices-hub' }, target: 'cat_spices_basic', note: '289 — عالم العطارة (Ragab El Attar / Al Khateeb)', review: true },

  /* ═══ 10. الإفطار والسبريد ═══════════════════════════════════════════════════════ */
  { match: { path: 'food-cupboard/cereals' }, target: 'cat_breakfast_cereal', note: '38' },
  { match: { path: 'food-cupboard/halawa-tahini' }, target: 'cat_breakfast_spreads', tags: ['طحينة', 'حلاوة طحينية'], note: '25 — straddles 10.2 and 10.3', review: true },

  /* ═══ 11. السناكس والمقرمشات ═════════════════════════════════════════════════════ */
  { match: { path: 'snacks-sweets/chips' }, target: 'cat_snacks_crisps', tags: ['شيبسي بطاطس'], note: '71' },
  { match: { path: 'snacks-sweets/salty-snacks' }, target: 'cat_snacks_crisps', note: '42' },
  { match: { path: 'snacks-sweets/popcorn' }, target: 'cat_snacks_crisps', tags: ['فشار جاهز'], note: '10' },
  { match: { path: 'snacks-sweets/nuts' }, target: 'cat_snacks_nuts', note: '4' },
  /*
   * NO rule for snacks-sweets/healthy-snacks (47 products): verified live, it is not "nuts and
   * nibbles" at all — it is a mix of granola/protein bars and oat biscuits. A blanket rule here
   * mis-filed all of it under cat_snacks_nuts. Left unrouted so tier C sorts it by keyword
   * (جرانولا → cat_breakfast_cereal, بسكويت → cat_conf_biscuits) instead of one wrong target.
   */
  { match: { path: 'fruits-vegetables/dates' }, target: 'cat_snacks_nuts', tags: ['تمر'], note: '23 — GAP: no dates bullet; 11.3 التسالي is nearest', review: true },

  /* ═══ 12. البسكويت والحلويات والشوكولاتة ═════════════════════════════════════════ */
  { match: { path: 'snacks-sweets/biscuits' }, target: 'cat_conf_biscuits', note: '125' },
  { match: { path: 'snacks-sweets/chocolate' }, target: 'cat_conf_chocolate', note: '91' },
  { match: { path: 'snacks-sweets/candy-gums' }, target: 'cat_conf_candy', tags: ['كاندي', 'علكة'], note: '87' },

  /* ═══ 13. المجمدات ═══════════════════════════════════════════════════════════════ */
  { match: { path: 'frozens/fruits-veggies' }, target: 'cat_frozen_veg', note: '60' },
  { match: { path: 'frozens/fries-starters' }, target: 'cat_frozen_potato', note: '57' },
  { match: { path: 'frozens/frozen-poultry' }, target: 'cat_frozen_poultry', note: '108' },
  { match: { path: 'frozens/frozen-meat' }, target: 'cat_frozen_meat', note: '53' },
  { match: { path: 'frozens/frozen-seafood' }, target: 'cat_frozen_seafood', note: '26' },
  { match: { path: 'frozens/frozen-meals' }, target: OUT_OF_SCOPE, note: '2 — removed by owner request 2026-09-14' },
  // HyperOne has no ice-cream category; tier C keyword 'ايس كريم' catches any that exist.

  /* ═══ 14. الفاكهة والخضروات الطازجة ══════════════════════════════════════════════ */
  { match: { path: 'fruits-vegetables/vegetables' }, target: 'cat_fresh_veg', note: '78' },
  { match: { path: 'fruits-vegetables/fruits' }, target: 'cat_fresh_fruit', note: '61' },
  { match: { path: 'fruits-vegetables/leaves' }, target: 'cat_fresh_herbs', note: '26 — ورقيات' },
  { match: { prefix: 'vegetables-01sa' }, target: 'cat_fresh_veg', note: '158 — branch mirror' },
  { match: { prefix: 'vegetables-01ec' }, target: 'cat_fresh_veg', note: '0 — branch mirror' },
  { match: { prefix: 'fruits-01sa' }, target: 'cat_fresh_fruit', note: '116 — branch mirror' },
  { match: { prefix: 'pickles-01sa' }, target: 'cat_groc_pickles', note: '37 — branch mirror' },
  { match: { path: 'food-cupboard/pickles' }, target: 'cat_groc_pickles', note: '27' },

  /* ═══ 15. المنتجات الجاهزة وشبه الجاهزة ══════════════════════════════════════════ */
  { match: { path: 'food-cupboard/noodles' }, target: 'cat_ready_instant', tags: ['نودلز'], note: '16' },

  /* ═══ 16. المنظفات والعناية بالمنزل ══════════════════════════════════════════════ */
  { match: { path: 'laundry/detergents' }, target: OUT_OF_SCOPE, note: '82 — removed by owner request 2026-09-15' },
  { match: { path: 'laundry/softener' }, target: OUT_OF_SCOPE, tags: ['منعم أقمشة'], note: '27 — removed by owner request 2026-09-15' },
  { match: { path: 'laundry/bleach' }, target: OUT_OF_SCOPE, tags: ['مبيض'], note: '23 — removed by owner request 2026-09-15' },
  { match: { path: 'laundry/stain-remover' }, target: OUT_OF_SCOPE, tags: ['مزيل بقع'], note: '7 — removed by owner request 2026-09-15' },
  { match: { path: 'cleaning-household/dishwashing' }, target: OUT_OF_SCOPE, note: '74 — removed by owner request 2026-09-15' },
  { match: { path: 'cleaning-household/multi-purpose-cleaners' }, target: OUT_OF_SCOPE, note: '63 — removed by owner request 2026-09-15' },
  { match: { path: 'cleaning-household/furniture-cleaners' }, target: OUT_OF_SCOPE, tags: ['ملمع أثاث'], note: '17 — removed by owner request 2026-09-15' },
  { match: { path: 'cleaning-household/glass-cleaners' }, target: OUT_OF_SCOPE, tags: ['منظف زجاج'], note: '8 — removed by owner request 2026-09-15' },
  { match: { path: 'cleaning-household/kitchen-cleaners' }, target: OUT_OF_SCOPE, tags: ['منظف مطابخ'], note: '7 — removed by owner request 2026-09-15' },
  { match: { path: 'cleaning-household/toilets' }, target: OUT_OF_SCOPE, tags: ['منظف حمامات'], note: '10 — removed by owner request 2026-09-15' },
  { match: { path: 'cleaning-household/air-fresheners' }, target: OUT_OF_SCOPE, tags: ['معطر جو'], note: '86 — removed by owner request 2026-09-15' },
  { match: { path: 'cleaning-household/insecticide-sprays' }, target: OUT_OF_SCOPE, tags: ['مبيدات حشرية'], note: '21 — GAP: no insecticide bullet in the brief — removed by owner request 2026-09-15', review: true },
  { match: { path: 'cleaning-household/cleaning-supplies-tools' }, target: OUT_OF_SCOPE, note: '48 — removed by owner request 2026-09-15' },
  { match: { path: 'home-garden/home-accessories/mops-brooms-dusters' }, target: OUT_OF_SCOPE, tags: ['ممسحة', 'مكنسة'], note: '35 — removed by owner request 2026-09-15' },

  /* ═══ 17 & 21. الورقيات والمناديل / التغليف ══════════════════════════════════════ */
  { match: { path: 'disposables-tissues/tissues-paper-rolls' }, target: 'cat_paper_tissues', note: '80' },
  { match: { path: 'disposables-tissues/food-wraps' }, target: 'cat_paper_household', tags: ['ورق ألومنيوم'], note: '67' },
  { match: { path: 'disposables-tissues/oven-bags' }, target: 'cat_paper_household', tags: ['أكياس فرن'], note: '9' },
  { match: { path: 'disposables-tissues/consumables' }, target: 'cat_paper_other', note: '19', review: true },
  { match: { path: 'disposables-tissues/garbage-bags' }, target: OUT_OF_SCOPE, tags: ['أكياس قمامة'], note: '62 — removed by owner request 2026-09-14' },
  { match: { path: 'disposables-tissues/disposable-tableware' }, target: OUT_OF_SCOPE, note: '33 — removed by owner request 2026-09-14' },

  /* ═══ 18. العناية الشخصية ════════════════════════════════════════════════════════ */
  { match: { path: 'health-beauty/hair-care' }, target: 'cat_care_hair', note: '318' },
  { match: { path: 'health-beauty/skin-body-care' }, target: 'cat_care_body', note: '218' },
  { match: { path: 'health-beauty/face-care' }, target: 'cat_care_body', tags: ['عناية الوجه'], note: '38', review: true },
  { match: { path: 'health-beauty/deodorants' }, target: 'cat_care_body', tags: ['مزيل عرق'], note: '73' },
  { match: { path: 'health-beauty/oral-care' }, target: 'cat_care_oral', note: '49' },
  { match: { path: 'health-beauty/shaving-hair-removing' }, target: 'cat_care_shaving', note: '33' },
  { match: { path: 'health-beauty/feminine-care' }, target: 'cat_care_feminine', note: '27' },

  /* ═══ 19. مستلزمات الأطفال ═══════════════════════════════════════════════════════ */
  { match: { path: 'baby-care/diapers' }, target: 'cat_baby_nappies', note: '46' },
  { match: { path: 'baby-care/bath-skin-care' }, target: 'cat_baby_care', note: '37' },
  { match: { path: 'baby-care/wipes' }, target: 'cat_baby_care', tags: ['مناديل مبللة'], note: '8' },
  { match: { path: 'baby-care/food-cereals' }, target: 'cat_baby_food', note: '25' },
  { match: { path: 'baby-care/baby-formula-milk' }, target: 'cat_baby_food', tags: ['ألبان أطفال'], note: '5' },

  /* ═══ 20. الأدوات المنزلية والمطبخ ═══════════════════════════════════════════════ */
  { match: { path: 'home-garden/kitchen-dining/cooking-tools' }, target: OUT_OF_SCOPE, note: '189 — removed by owner request 2026-09-14' },
  { match: { path: 'home-garden/kitchen-dining/food-storage' }, target: OUT_OF_SCOPE, note: '73 — removed by owner request 2026-09-14' },
  { match: { path: 'home-garden/kitchen-dining/tableware' }, target: OUT_OF_SCOPE, note: '188 — removed by owner request 2026-09-14' },
  // 'houseware' is not plasticware — samples show ironing tables, shoe racks, bathroom mats,
  // washing-machine covers and clotheslines, i.e. a general home/laundry/bath bucket with no
  // matching leaf anywhere in the 25 sections. Dropped like the other mismatched home-garden
  // subpaths (car-accessories, garden-supplies, water-filters) rather than mislabeled as
  // Plasticware. Two genuinely kitchen items in this bucket (a silicone pot holder, a wooden
  // mallet) are adjudicated individually in overrides.ts instead of keeping the whole path.
  { match: { path: 'home-garden/home-accessories/houseware' }, target: OUT_OF_SCOPE, note: '32 — general household/bath/laundry goods, not kitchen plasticware' },
  { match: { path: 'home-garden/home-accessories/bins' }, target: OUT_OF_SCOPE, tags: ['حاويات'], note: '12 — removed by owner request 2026-09-14' },
  { match: { path: 'office-school-supplies/lunch-boxes-drinking-bottles' }, target: OUT_OF_SCOPE, tags: ['علب حفظ'], note: 'lunch boxes — removed by owner request 2026-09-14' },

  /* ═══ 22. مستلزمات الحيوانات الأليفة ═════════════════════════════════════════════ */
  { match: { path: 'pet-food-supplies/pet-food' }, target: OUT_OF_SCOPE, note: '36 — removed by owner request 2026-09-14' },
  { match: { path: 'pet-food-supplies/pet-accessories-toys' }, target: OUT_OF_SCOPE, note: '20 — removed by owner request 2026-09-14' },
  // Some products carry only the bare parent path, with no level-3 membership at all.
  { match: { prefix: 'pet-food-supplies' }, target: OUT_OF_SCOPE, note: 'bare parent fallback — removed by owner request 2026-09-14', review: true },

  /* ═══ 23. مستلزمات منزلية وكهربائية بسيطة ════════════════════════════════════════ */
  { match: { path: 'home-garden/diy-tools' }, target: OUT_OF_SCOPE, note: '113 — عدد وآلات, coarser than 23.2 — removed by owner request 2026-09-14', review: true },
  { match: { prefix: 'grills-coal' }, target: OUT_OF_SCOPE, tags: ['فحم', 'ولاعات'], note: '44 — GAP: no grilling bullet — removed by owner request 2026-09-14', review: true },

  /* ═══ 24. مستلزمات مدرسية ومكتبية ════════════════════════════════════════════════ */
  { match: { prefix: 'office-school-supplies/pens-pencils-markers' }, target: OUT_OF_SCOPE, note: 'pens/pencils/markers — removed by owner request 2026-09-14' },
  { match: { prefix: 'office-school-supplies/drawing-coloring' }, target: OUT_OF_SCOPE, tags: ['أقلام ألوان'], note: 'colouring — removed by owner request 2026-09-14' },
  { match: { prefix: 'office-school-supplies/white-boards-erasers' }, target: OUT_OF_SCOPE, note: 'boards/erasers — removed by owner request 2026-09-14' },
  { match: { path: 'toys-stationary/stationery' }, target: OUT_OF_SCOPE, note: '229 — spans 24.1 and 24.2 — removed by owner request 2026-09-14', review: true },

  /* ═══ OUT OF SCOPE — dropped and counted, never review-queued ════════════════════ */
  /*
   * Without these the review queue would be ~2,500 televisions and nobody would read it.
   * A product whose ONLY membership resolves here is dropped; a product that is ALSO in a
   * real food category keeps that one (see the multi-membership reduction in classify.ts).
   */
  { match: { prefix: 'electronics' }, target: OUT_OF_SCOPE, note: '1027 — outside the 25 sections' },
  { match: { prefix: 'toys-stationary/games' }, target: OUT_OF_SCOPE, note: '184 — toys' },
  /*
   * `toys` and `christmas-products` are SEPARATE top-level trees from `toys-stationary`, which
   * is easy to miss: products carry both. Without these two rules ~400 puzzles, blasters,
   * playdough sets and Christmas baubles land in the review queue instead of being dropped.
   */
  { match: { prefix: 'toys' }, target: OUT_OF_SCOPE, note: 'separate top-level toys tree' },
  { match: { prefix: 'christmas-products' }, target: OUT_OF_SCOPE, note: 'seasonal decor' },
  { match: { prefix: 'home-garden/car-accessories' }, target: OUT_OF_SCOPE, note: '207' },
  { match: { prefix: 'home-garden/garden-supplies' }, target: OUT_OF_SCOPE, note: '36' },
  { match: { prefix: 'home-garden/water-filters' }, target: OUT_OF_SCOPE, note: '21' },
  { match: { prefix: 'icon' }, target: OUT_OF_SCOPE, note: '145 — ICON apparel/home line' },
  { match: { prefix: 'summer-products' }, target: OUT_OF_SCOPE, note: '53 — beach, floaties' },
  { match: { prefix: 'health-beauty/perfumes' }, target: OUT_OF_SCOPE, note: '78 — GAP: no perfume bullet in section 18' },
  { match: { prefix: 'health-beauty/health-care-supplies' }, target: OUT_OF_SCOPE, note: '2' },
  { match: { prefix: 'laundry/shoe-care' }, target: OUT_OF_SCOPE, note: '58 — GAP: no shoe-care bullet in section 16' },
  { match: { prefix: 'al-serja' }, target: OUT_OF_SCOPE, note: '7 — unclear department' },
  /*
   * `exclusive-deals/*` and `icon-deals` are PROMOTIONAL groupings, not taxonomy — every
   * product in them also sits in a real category. Marking them out of scope is what stops a
   * Unilever deal from being filed under "Save More" instead of under Dishwashing.
   */
  { match: { prefix: 'exclusive-deals' }, target: OUT_OF_SCOPE, note: 'promo grouping, not a department' },
  { match: { prefix: 'icon-deals' }, target: OUT_OF_SCOPE, note: 'promo grouping' },
];

/*
 * Legacy CSV rules: for docs/products/**.csv the "source path" is the FILE path, so 19
 * one-line rules classify all 807 committed rows. Kept separate because those artifacts are
 * an archive/cross-check, not a live source.
 */
export const CSV_SOURCE_RULES: readonly SourceRule[] = [
  { match: { path: 'اجبان' }, target: 'cat_dairy_cheese', note: 'CSV 125 rows' },
  { match: { path: 'كريمه ولبنه' }, target: 'cat_dairy_cream', note: 'CSV 18' },
  { match: { path: 'زبادي' }, target: 'cat_dairy_yoghurt', note: 'CSV 25' },
  { match: { path: 'زبادي يوناني' }, target: 'cat_dairy_yoghurt', note: 'CSV 27' },
  { match: { path: 'زبادو و لبن رايب' }, target: 'cat_dairy_yoghurt', note: 'CSV 33' },
  { match: { path: 'بودينج ودانيت' }, target: 'cat_dairy_yoghurt', note: 'CSV 28' },
  { match: { path: 'ألبان معلبه' }, target: 'cat_dairy_milk', note: 'CSV 28' },
  { match: { path: 'البان بودر' }, target: 'cat_dairy_milk', tags: ['لبن بودرة'], note: 'CSV 20' },
  { match: { path: 'البان نكهات' }, target: 'cat_dairy_milk', tags: ['لبن منكّه'], note: 'CSV 15' },
  { match: { path: 'بيض' }, target: 'cat_dairy_eggs', note: 'CSV 8' },
  { match: { path: 'شاي' }, target: 'cat_bev_hot', tags: ['شاي'], note: 'CSV 35' },
  { match: { path: 'قهوه وبن وناسكفيه' }, target: 'cat_bev_hot', tags: ['قهوة'], note: 'CSV 142' },
  { match: { path: 'اعشاب' }, target: 'cat_bev_hot', tags: ['مشروبات أعشاب'], note: 'CSV 57' },
  { match: { path: 'كاكاو' }, target: 'cat_bev_hot', tags: ['هوت شوكليت'], note: 'CSV 11' },
  { match: { path: 'مشروبات/عصائر' }, target: 'cat_bev_juices', note: 'CSV 96' },
  { match: { path: 'مشروبات/عصائر مركزه' }, target: 'cat_bev_juices', note: 'CSV 12' },
  { match: { path: 'مشروبات/مشروبات بدره' }, target: 'cat_bev_juices', note: 'CSV 12' },
  { match: { path: 'مشروبات/مشروبات غازيه' }, target: 'cat_bev_carbonated', note: 'CSV 95' },
  { match: { path: 'مشروبات/مشروبات طاقة' }, target: 'cat_bev_energy', note: 'CSV 20' },
];
