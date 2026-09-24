# Ragab Web Design System

> هذه وثيقة **التطبيق على الويب**. الوثيقة الكنسية الموحدة (Web + Flutter) والتوكنز المصدرية في جذر المشروع:
> `../design/DESIGN_SYSTEM.md` + `../design/tokens/ragab.tokens.json` — أي تغيير توكن يبدأ هناك ثم يُعكس هنا وفي `Mobile/lib/core/theme/`.

مصدر التوكنز داخل الويب: `apps/web/tailwind.config.ts`. هذا الملف توثيق فقط — أي تعديل يبدأ من الـ config.

## الألوان

| Namespace | الاستخدام |
|---|---|
| `ragab-brand-50…700` | سلّم الأصفر. `brand-500` = `#F4C430` هوية العلامة. **الأصفر للـ CTA والشارات فقط** — ليس للخلفيات الواسعة |
| `ragab-ink-50…900` | المحايد. النصوص: `ink-800` أساسي، `ink-600` ثانوي، `ink-500` مكتوم. **لا تستخدم `ink-400` أو أفتح لنصوص ذات معنى** (تباين < 4.5:1) |
| `ragab-bg` `#FAF9F6` | خلفية الصفحة الدافئة |
| `ragab-surface` / `cream` / `cream-soft` | أسطح البطاقات والتمييز الترويجي |
| `ragab-success/danger/warning/info` + `-soft` | دلالية. الخصم دائماً `danger` (أحمر) لا أصفر |

**قاعدة ملزِمة:** لا نص أبيض على `brand-500` إطلاقاً (نسبة 1.65:1) — الفحمي `ink-800` فقط.

## الطباعة

خطوط عبر `next/font` في `layout.tsx`: Tajawal 400/500/700/800 (العربية والأساس) و Poppins 400–700 (اللاتينية).

سلّم المقاسات (كلاسات `text-*`): `display · h1 · h2 · h3 · body · body-sm · label · caption · price · price-lg`.
العناوين clamp متجاوبة. الحد الأدنى 12px (`caption`). لا `text-[10px]`.

> **مهم:** عند إضافة مقاس جديد هنا يجب إضافته أيضاً في `packages/utils/src/cn.ts` (قائمة `font-size` في `extendTailwindMerge`) وإلا سيعامله tailwind-merge كـ **لون** ويُسقط `text-white` المجاور.

## الشبكة والمقاسات

- Breakpoints: الافتراضي + `xs: 400px` و `3xl: 1720px`
- الحاوية: `.container-page` = `max-w-screen-2xl px-4 sm:px-6 lg:px-8`
- شبكة المنتجات: `2 → sm:3 → md:4 → xl:5 → 3xl:6` (نسخة `narrow` داخل تخطيط الفلاتر: `2 → md:3 → xl:4`)
- Radius: `sm 6 · md 8 · lg 12 · xl 16 · 2xl 20`
- Shadows دافئة: `subtle · card · card-hover · popover · sticky`

## RTL

utilities **منطقية فقط**: `ps/pe · ms/me · start/end · text-start/end · border-s/e`. لا `left/right/pl/pr` جديدة.
الأيقونات الاتجاهية: `ArrowLeft` مع `ltr:rotate-180` — بلا تفريعات `isRTL` في JS.
اللغة المحفوظة تُطبَّق قبل الرسم عبر سكربت inline في `<head>` (`layout.tsx`).

## فئات مشتركة (`globals.css`)

`.container-page` · `.focus-ring` (إلزامية على كل عنصر تفاعلي) · `.card-surface` · `.scroll-rail` (شريط snap أفقي) · `.touch-target` (44px)

## متغيّرات التخطيط

`--bottom-nav-h` (60px): أي شريط ثابت سفلي على الموبايل يجب أن يستخدم
`bottom: calc(var(--bottom-nav-h) + env(safe-area-inset-bottom))` لتفادي التداخل مع شريط التنقل.

## مكوّنات

الموقع الوحيد: `apps/web/src/components/ui/` (الـ primitives) و `components/product/` (المركّبة).
كل مكوّن يستخدم `cn()` من `@ragab/utils`. `packages/ui` مُهمَل لتطبيق الويب (انظر README الخاص به).

| فئة | المكوّنات |
|---|---|
| Primitives | Button · Badge · Price · Rating · Chip · QuantitySelector · IconButton · Drawer · Modal · Toast · Skeleton · EmptyState · SectionHeader |
| Product | ProductCard · ProductGrid · ProductStrip · ProductGallery · CartLineItem · CategoryCard · OfferCard |
| Listing | ProductToolbar · FilterPanel · ActiveFilters · useProductListing |
| Layout | Header · MegaMenu · SearchOverlay · MobileNavigation · TopBanner · CartDrawer · Footer |

## حالات إلزامية لكل صفحة قوائم

Loading (skeleton مطابق للبطاقة) · Empty (مع CTA) · Error (مع «حاول مرة أخرى») · No-results · Out-of-stock (تعتيم + شارة) · Low-stock (`باقي X فقط`).
