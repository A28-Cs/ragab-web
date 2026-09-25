/**
 * Pack-size parser (§catalog import). Every input below is a REAL name from the live
 * HyperOne catalog or from the CSVs committed at docs/products/ — not invented shapes.
 */
import { describe, it, expect } from 'vitest';
import { parseSize, formatUnit, packNumberFromUrlKey, eanFromUrlKey, reconcileSize } from './units';

describe('parseSize — real catalog shapes', () => {
  const cases: Array<[string, number | null, string | null, number | null]> = [
    // name, unitValue, unitMeasure, packCount
    ['Nestle Pure Life Water - 330ml x 20 Bottles', 330, 'ml', 20],
    ['مياه طبيعية نستلة - 330مل *20 زجاجة', 330, 'ml', 20],
    ['Hayat Natural Water Gallon -19L', 19, 'L', null],
    ['جالون مياه طبيعية حياة - 19لتر', 19, 'L', null],
    ['جبنة كريمي سبريد كيري - 150جم', 150, 'g', null],
    ['جبنة مثلثات أبو الولد - 8 قطع', 8, 'pc', null],
    ['كرتونة  بيض أحمر توب فاليو-30بيضة', 30, 'pc', null],
    ['زيت عباد الشمس كريستال - 1.5 لتر', 1.5, 'L', null],
    ['أرز مصري فاخر الضحى - 5 كجم', 5, 'kg', null],
    ['شاي العروسة - 50 فتلة', 50, 'pc', null],
    ['عصير مانجو جهينة - 1لتر * 6 قطع', 1, 'L', 6],
    // 'ك' / 'k' are the catalog's own kilo shorthand.
    ['زبادي طبيعي جهينه -  5ك', 5, 'kg', null],
    ['Lametna Vermicelli Pasta - 1k', 1, 'kg', null],
    // Count nouns, not measures.
    ['الوان شمع ديلي - 24 لون - C21020', 24, 'pc', null],
  ];

  for (const [name, value, measure, pack] of cases) {
    it(`parses ${name}`, () => {
      const p = parseSize(name);
      expect(p.unitValue).toBe(value);
      expect(p.unitMeasure).toBe(measure);
      expect(p.packCount).toBe(pack);
    });
  }

  it('separates the descriptor from the size, so numbers never reach keyword matching', () => {
    expect(parseSize('مياه طبيعية نستلة - 330مل *20 زجاجة').descriptor).toBe('مياه طبيعية نستلة');
    expect(parseSize('Hayat Natural Water Gallon -19L').descriptor).toBe('Hayat Natural Water Gallon');
  });

  it('prefers the longest unit token — كجم before كج before ج', () => {
    // Without longest-first ordering, "1 كجم" parses as "1 ك" plus junk.
    expect(parseSize('أرز - 1 كجم').unitMeasure).toBe('kg');
    expect(parseSize('جبنة - 1 جم').unitMeasure).toBe('g');
  });

  it('converts to comparable base quantities across units', () => {
    // 1 L must equal 1000 ml for cross-source size matching to work at all.
    expect(parseSize('عصير - 1 لتر').baseQuantity).toEqual({ value: 1000, measure: 'ml' });
    expect(parseSize('أرز - 1 كجم').baseQuantity).toEqual({ value: 1000, measure: 'g' });
    // A multipack's base quantity is the TOTAL.
    expect(parseSize('مياه - 330مل *20').baseQuantity).toEqual({ value: 6600, measure: 'ml' });
  });

  it('ignores implausible multipliers', () => {
    // A model number is not a pack count.
    expect(parseSize('مروحة فريش - 500014206').packCount).toBeNull();
  });

  it('always yields a non-empty unit string — the columns are NOT NULL', () => {
    const p = parseSize('برازق');
    expect(p.unitMeasure).toBeNull();
    expect(formatUnit(p, 'ar')).toBe('قطعة');
    expect(formatUnit(p, 'en')).toBe('piece');
    expect(p.warnings).toContain('NO_SIZE_PARSED');
  });

  it('formats with U+00D7, not the source ASCII asterisk', () => {
    const p = parseSize('مياه نستله - 330مل *20 زجاجة');
    expect(formatUnit(p, 'ar')).toBe('330 مل × 20');
    expect(formatUnit(p, 'en')).toBe('330 ml × 20');
    expect(formatUnit(p, 'ar')).not.toContain('*');
  });
});

describe('diaper baby-weight ranges are not mistaken for the product size', () => {
  // 43 real listings carry a baby-weight range ("9 - 18ك") immediately before "مقاس"; the
  // product's real size is the piece count at the very end of the name.
  it('extracts the piece count, not the baby-weight range', () => {
    const p = parseSize('حفاضات أطفال بامبرز - 9 - 18ك - مقاس 4 - 80 حفاضة');
    expect(p.unitValue).toBe(80);
    expect(p.unitMeasure).toBe('pc');
  });

  it('does not consume an unrelated size elsewhere in the name', () => {
    // "مقاس 16-20" here is a shrimp size grading, not a baby-weight range — 1ك is the real size.
    const p = parseSize('جمبري بالذيل سولي - مقاس 16-20 - 1ك');
    expect(p.unitValue).toBe(1);
    expect(p.unitMeasure).toBe('kg');
  });
});

describe('url_key oracle', () => {
  it('extracts the pack number from <packNumber>-<EAN>', () => {
    expect(packNumberFromUrlKey('150-3073781107302')).toBe(150);
    expect(packNumberFromUrlKey('330-20-6224010081116')).toBe(330);
    expect(packNumberFromUrlKey('30-9634000066226')).toBe(30);
    expect(packNumberFromUrlKey('19-6224001589089')).toBe(19);
  });

  it('returns null when the key is not that shape', () => {
    expect(packNumberFromUrlKey('b-20-6223002270026')).toBeNull();
    expect(packNumberFromUrlKey('deli-c-12-00912-6973726149381')).toBeNull();
    expect(packNumberFromUrlKey('icon-women-printed-bikini-panty')).toBeNull();
    expect(packNumberFromUrlKey(null)).toBeNull();
  });

  it('extracts the EAN from a url_key or a full product URL', () => {
    expect(eanFromUrlKey('1-6-10-6222014300974')).toBe('6222014300974');
    expect(eanFromUrlKey('https://www.hyperone.com.eg/ar/product/150-3073781107302')).toBe(
      '3073781107302',
    );
    expect(eanFromUrlKey('icon-women-printed-bikini-panty')).toBeNull();
  });

  it('flags a disagreement between the parse and the oracle', () => {
    const ar = parseSize('جبنة كيري - 150جم');
    // The oracle says 999, the name says 150 — that is a real conflict, not a rounding artefact.
    const { warnings } = reconcileSize(null, ar, '999-3073781107302');
    expect(warnings).toContain('SIZE_URLKEY_DISAGREE');
  });

  it('agrees when the oracle matches the parsed value', () => {
    const ar = parseSize('جبنة كيري - 150جم');
    const { warnings } = reconcileSize(null, ar, '150-3073781107302');
    expect(warnings).not.toContain('SIZE_URLKEY_DISAGREE');
  });
});

describe('pharmacy (Chefaa) titles — strength is not the pack size', () => {
  // name, unitValue, unitMeasure, expected unitAr, expected unitEn — all real Chefaa titles.
  const cases: Array<[string, number, string, string, string]> = [
    ['كنترولوك | 40مجم | لعلاج قرحة المعدة | 14 قرص', 14, 'pc', '14 قرص', '14 tablets'],
    ['بانادول ادفانس 500 مجم باراسيتامول مسكن للألم بفاعلية | 48 قرص', 48, 'pc', '48 قرص', '48 tablets'],
    ['برشام فياجرا 100 للرجال للانتصاب (سيلدينافيل 100 مجم) | 4 قرص', 4, 'pc', '4 قرص', '4 tablets'],
    ['قطرة أوتريفين للكبار نقط للانف Otrivin للاحتقان والانسداد | 15 مل', 15, 'ml', '15 مل', '15 ml'],
    ['كريم كارباميد للوجه والمنطقه الحساسة والقدم للجفاف والتفتيح | 30 جم', 30, 'g', '30 جم', '30 g'],
    ['برشام ميلجا ادفانس للرجال والنساء للأعصاب milga advance | ٣٠ قرص', 30, 'pc', '30 قرص', '30 tablets'],
    ['ديفارول اس 200000وحده دوليه /2مل | 1 امبول', 1, 'pc', '1 امبول', '1 ampoules'],
    ['فوار كتافاست للاسنان ومسكن للصداع catafast | ٩ أكياس', 9, 'pc', '9 أكياس', '9 sachets'],
    ['دواء ميثايلتكنو للنساء والرجال Methyltechno بديل حقن فيتامين ب12 | 30 فيلم', 30, 'pc', '30 فيلم', '30 films'],
  ];

  for (const [name, value, measure, unitAr, unitEn] of cases) {
    it(`parses ${name}`, () => {
      const p = parseSize(name);
      expect(p.unitValue).toBe(value);
      expect(p.unitMeasure).toBe(measure);
      expect(formatUnit(p, 'ar')).toBe(unitAr);
      expect(formatUnit(p, 'en')).toBe(unitEn);
    });
  }

  it('never reads a bare milligram strength as grams', () => {
    const p = parseSize('كنترولوك 40مجم');
    expect(p.unitMeasure).not.toBe('g');
  });
});
