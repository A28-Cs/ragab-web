/**
 * Manual classification overrides (§catalog import, stage 3 tier A).
 *
 * This file IS the review loop's output. The planner writes `review-queue.csv`; a human fills
 * in the `decision` column; the decisions land here; the planner re-runs. Because tier A is
 * the highest-confidence tier and is checked into git, the loop converges — a product
 * adjudicated once stays adjudicated across every future run and every re-fetch.
 *
 * Key = the product's EAN (== HyperOne `sku` == `products.sku`).
 * Value = a leaf id from taxonomy.ts, or OUT_OF_SCOPE to drop the product entirely.
 *
 * taxonomy.test.ts asserts every value here resolves to a real leaf, so a typo is a failed
 * unit test rather than a product that vanishes at import time.
 */
import { OUT_OF_SCOPE } from './types';

export const SKU_OVERRIDES: Readonly<Record<string, string>> = {
  // '6224010081116': 'cat_bev_water',
  // '1234567890123': OUT_OF_SCOPE,

  // disposables-tissues/consumables → cat_paper_other is otherwise a correct department-level
  // rule (gloves, disposable prayer mats, toilet seat covers, kitchen aprons), but these two
  // products are matches and a lighter refill, not paper/tissue consumables — cat_hw_household
  // already has 'كبريت'/'ولاعه' as keywords, they just can't win over a whole-department tier-B rule.
  '7310685010151': OUT_OF_SCOPE, // كبريت سويدى ثلاث نجوم - كبير
  '7310688001118': OUT_OF_SCOPE, // كبريت سويدى ثلاث نجوم وسط*3ق
  '7310680020100': OUT_OF_SCOPE, // كبريت سويدي ثلاثة نجوم * 10 قطع
  '6224000101473': OUT_OF_SCOPE, // غاز ولاعه نقي يونيفرسال - 300مل

  // home-garden/home-accessories/houseware is now OUT_OF_SCOPE as a whole (see rules.ts) since
  // it's mostly ironing tables/doormats/clotheslines with no matching leaf — but these two are
  // genuine kitchen tools that would otherwise be dropped along with the rest of the bucket.
  '6901649210116': OUT_OF_SCOPE, // ماسك سيليكون نيوفلام (silicone pot holder)
  '2030200021176': OUT_OF_SCOPE, // هراشة خشب (wooden meat mallet/pestle)

  // These two HyperOne rows carry sourcePaths: [] (no department membership at all — an
  // upstream data gap, not a classify.ts bug), so they fall through to whole-catalog tier-C
  // scoring with no source-path anchor. "نعناع" (mint, the flavour) then outscores the actual
  // product type and wins cat_spices_dried_herbs for what is a lemon-mint rayeb drink.
  '6223007527637': 'cat_dairy_yoghurt', // رايب المراعي ليمون نعناع 220مل
  '6223007527644': 'cat_dairy_yoghurt', // رايب المراعي ليمون نعناع 425مل

  // cat_dairy_milk's new 'رايب' veto (taxonomy.ts) correctly fixes the ~17 رايب products that
  // were otherwise winning Milk by generic sibling refinement — but these 5 carry no usable
  // source path of their own (either sourcePaths: [], or their only OTHER path is a
  // 'cheese-01sa' branch-mirror artifact), so once Milk is off the table they have nothing
  // else to fall back to and either drop entirely or land on Cheese. All five are rayeb
  // drinking-yogurt/milk products; cat_dairy_yoghurt is correct for all of them.
  '6224000432300': 'cat_dairy_yoghurt', // لبن رايب طبيعي لايت مزارع دينا - 850مل
  '6224000432133': 'cat_dairy_yoghurt', // لبن رايب طبيعي مزارع دينا - 250مل
  '6223002381609': 'cat_dairy_yoghurt', // حليب رايب اكتيفيا 390 جم
  '6223000351765': 'cat_dairy_yoghurt', // لبن رايب جهينه - 1لتر
  '6222014352010': 'cat_dairy_yoghurt', // لبن رايب كامل الدسم جهينة1لتر

  // cat_frozen_icecream's requireAny ('ايس كريم') and cat_baking_supplies's forbidAny
  // (FREEZER_TOKENS, which includes the literal phrase 'ايس كريم') collide on these 9: they
  // are ambient, shelf-stable ice-cream-FLAVOUR powder mixes (food-cupboard/baking-ingredients),
  // not actual frozen ice cream — but the words "ايس كريم" are in their own name and forbidAny
  // has no way to say "unless it's a بودرة". cat_baking_supplies is the correct home; it already
  // carries flavourings/vanilla/cocoa-powder keywords.
  '6223001085935': 'cat_baking_supplies', // ايس كريم فراولة بودرة دريم - 80جم
  '6223003291907': 'cat_baking_supplies', // ايس كريم بودرة فانيليا 5 مينتس - 170جم
  '6223003292218': 'cat_baking_supplies', // ايس كريم بودرة كراميل 5 مينتس - 170جم
  '6223003292232': 'cat_baking_supplies', // ايس كريم بودرة مانجو 5 مينتس - 170جم
  '6223003291921': 'cat_baking_supplies', // ايس كريم بودرة شوكولاتة 5 مينتس - 170جم
  '6223001085928': 'cat_baking_supplies', // ايس كريم شوكولاتة بودرة دريم - 80جم
  '6223001085911': 'cat_baking_supplies', // ايس كريم فانيليا بودرة دريم - 80جم
  '6223003291914': 'cat_baking_supplies', // ايس كريم فراولة بودرة 5 مينتس - 170جم
  '6223001085942': 'cat_baking_supplies', // ايس كريم مانجو بودرة دريم - 80جم

  // "برتقال عصير" here is fresh-produce jargon for "juicing orange" (sourced from
  // fruits-vegetables/fruits, the produce tree, alongside تفاح/مانجو/موز etc) — whole oranges,
  // not a bottled juice product. The bare 'عصير' token wins cat_bev_juices in the whole-
  // catalog keyword fallback because cat_fresh_fruit forbids 'عصير' (correctly, to keep
  // concentrate/cordial out of fresh fruit) and has no exception for this naming convention.
  '2394328000001': 'cat_fresh_fruit', // برتقال عصير
  '2020700003222': 'cat_fresh_fruit', // برتقال عصير - 4ك

  // "دانون فراولة" is a strawberry-flavoured yogurt cup, not fresh strawberries — bare
  // 'فراولة' won cat_fresh_fruit in the same whole-catalog fallback (sourcePaths: []).
  '6223002381258': 'cat_dairy_yoghurt', // دانون فراولة 100جم 4ق

  // snacks-sweets/healthy-snacks was deliberately left unrouted (see rules.ts) so جرانولا/
  // بسكويت keywords could classify it via tier C — but these two "بار" snack bars carry no
  // such keyword, only a coffee/chocolate/hazelnut flavour descriptor, and fell through to
  // whatever department those bare words belong to (Hot Beverages, via 'قهوة'). Nuts & Seeds
  // is the closest existing home for a protein/nut snack bar.
  '6223006312388': 'cat_snacks_nuts', // بروتين بار شوكولاتة وقهوة أبو عوف - 70 جم
  '6223011433511': 'cat_snacks_nuts', // مكسرات بار شوكولاتة وبندق أبو عوف - 40جم

  // A McVities digestive biscuit, bare-matched into Grains & Cereals by its own 'قمح' (wheat)
  // token — it is a finished biscuit, not a raw grain.
  '6223003804572': 'cat_conf_biscuits', // بسكويت القمح شوكولاتة داكنة دايجستف مكفتيز

  // bakery-01sa/bakery is otherwise a clean, correct Bread department rule — these three are
  // genuine strays: a marshmallow and two festive Ramadan-dessert filled rolls, none of them
  // bread.
  '2395063000004': 'cat_conf_candy', // مارشميلو هايبروان
  '2020600002295': OUT_OF_SCOPE, // بولة قشطة مانجو هايبروان
  '2020600013650': OUT_OF_SCOPE, // بولة كنافة لوتس مانجو هايبروان

  // بودينج (pudding) is a chilled dairy dessert with no dedicated leaf in the 25 sections; it
  // bare-matched Candy/Chocolate on its كراميل/شوكولاتة flavour tokens. cat_dairy_cream's own
  // "منتجات ألبان مبردة متنوعة" (assorted chilled dairy products) bullet is the better fit.
  '6223007527613': 'cat_dairy_cream', // بودينج المراعي كراميل 100 جرام
  '6223007527620': 'cat_dairy_cream', // بودينج المراعي كراميل 100جم 4ق وفر 5ج
  '6222014301230': 'cat_dairy_cream', // بودينج كراميل توفي بريميم جهينة 150جم
  '6222014301247': 'cat_dairy_cream', // بودينج دبل شوكولاتة بريميم جهينة 150جم
};

/** Re-exported so a reviewer can write OUT_OF_SCOPE without a second import. */
export { OUT_OF_SCOPE };
