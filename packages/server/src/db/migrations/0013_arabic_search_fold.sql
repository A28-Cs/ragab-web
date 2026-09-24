-- 0013_arabic_search_fold — normalizes Arabic orthographic spelling variance on BOTH
-- sides of every product search comparison. Before this, "طحينة" (teh marbuta) and
-- "طحينه" (heh) — visually near-identical, and the second is how most people actually
-- type on a phone keyboard — were treated as different strings by both the trigram
-- ILIKE fallback and the FTS tsvector, so only whichever spelling matched the stored
-- product name returned results.
--
-- 1. arabic_fold(text): IMMUTABLE SQL function (safe for expression indexes). Folds:
--      ALEF HAMZA ABOVE / BELOW, ALEF MADDA, ALEF WASLA  →  ALEF        (أ إ آ ٱ → ا)
--      ALEF MAKSURA                                       →  YEH         (ى → ي)
--      TEH MARBUTA                                        →  HEH         (ة → ه)
--      WAW HAMZA                                          →  WAW         (ؤ → و)
--      YEH HAMZA                                          →  YEH         (ئ → ي)
--      HAMZA                                              →  dropped     (ء → '')
--    plus the short vowel marks (fathatan/dammatan/kasratan/fatha/damma/kasra/shadda/
--    sukun) and the tatweel (kashida) stretch character, then lower() for Latin text.
--    Characters are built with chr(<codepoint>) rather than typed literally so the
--    mapping is unambiguous in a left-to-right SQL file (every codepoint is listed in
--    the comment above and can be checked against the Unicode Arabic block).
--    Mirrors packages/server/src/db/taxonomy/normalize.ts's `fold()` FOLD_MAP, which
--    normalizes the same variance for catalog import/classification — this gives the
--    live search path the equivalent of that offline matching.
--
-- 2. products_search_vector_update rebuilt to fold every field before to_tsvector, so
--    the stored tsvector no longer distinguishes spelling variants either.
--
-- 3. Expression trigram indexes on arabic_fold(name_ar) / arabic_fold(name_en) back the
--    ILIKE fallback in modules/catalog/repository.ts, which now wraps BOTH sides of the
--    comparison (column and incoming query) in arabic_fold(), computed entirely in SQL
--    so query and column are folded by the exact same function.
--
-- 4. Backfill: re-fire the trigger for every existing row (same pattern as 0012), so
--    search_vector reflects the new folding immediately.
--
-- Idempotent: CREATE OR REPLACE / IF NOT EXISTS throughout, safe to re-run.
--
-- Rollback (manual):
--   DROP INDEX IF EXISTS products_name_ar_fold_trgm_idx;
--   DROP INDEX IF EXISTS products_name_en_fold_trgm_idx;
--   Revert products_search_vector_update to the 0012_catalog_import.sql definition,
--   then re-fire it: UPDATE products SET updated_at = updated_at;
--   DROP FUNCTION IF EXISTS arabic_fold(text);

CREATE OR REPLACE FUNCTION "arabic_fold"(input text) RETURNS text AS $$
  SELECT lower(
    translate(
      regexp_replace(
        coalesce(input, ''),
        '[' ||
          chr(1611) || chr(1612) || chr(1613) || chr(1614) || chr(1615) ||
          chr(1616) || chr(1617) || chr(1618) || chr(1600) ||
        ']',
        '',
        'g'
      ),
      -- from: أ(1571) إ(1573) آ(1570) ٱ(1649) ى(1609) ة(1577) ؤ(1572) ئ(1574) ء(1569)
      chr(1571) || chr(1573) || chr(1570) || chr(1649) || chr(1609) ||
      chr(1577) || chr(1572) || chr(1574) || chr(1569),
      -- to:   ا(1575) ا(1575) ا(1575) ا(1575) ي(1610) ه(1607) و(1608) ي(1610)  [ء drops — no 9th target]
      chr(1575) || chr(1575) || chr(1575) || chr(1575) || chr(1610) ||
      chr(1607) || chr(1608) || chr(1610)
    )
  )
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "products_search_vector_update"() RETURNS trigger AS $$
BEGIN
  NEW."search_vector" :=
      setweight(to_tsvector('simple', arabic_fold(NEW."name_ar")), 'A')
    || setweight(to_tsvector('simple', arabic_fold(NEW."name_en")), 'A')
    || setweight(to_tsvector('simple', arabic_fold(NEW."brand_ar")), 'B')
    || setweight(to_tsvector('simple', arabic_fold(NEW."brand_en")), 'B')
    || setweight(to_tsvector('simple', arabic_fold(array_to_string(NEW."tags", ' '))), 'B')
    || setweight(to_tsvector('simple', arabic_fold(NEW."description_ar")), 'C')
    || setweight(to_tsvector('simple', arabic_fold(NEW."description_en")), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "products_name_ar_fold_trgm_idx" ON "products" USING gin ((arabic_fold("name_ar")) gin_trgm_ops);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "products_name_en_fold_trgm_idx" ON "products" USING gin ((arabic_fold("name_en")) gin_trgm_ops);
--> statement-breakpoint

-- Backfill: re-fire the BEFORE UPDATE trigger for every existing row so search_vector
-- picks up the new fold-based tokenization immediately, without waiting for the next
-- unrelated write.
UPDATE "products" SET "updated_at" = "updated_at";
--> statement-breakpoint

ANALYZE "products";
