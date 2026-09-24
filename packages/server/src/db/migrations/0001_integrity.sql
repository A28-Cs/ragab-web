-- =============================================================================
-- 0001_integrity — DB-level integrity the application cannot bypass (§4).
-- Hand-authored: CHECK constraints, append-only triggers, refund cap, search.
-- Every statement is separated by the drizzle statement-breakpoint marker so the
-- custom migrator can apply them one at a time.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gin;
--> statement-breakpoint

-- ---- Inventory: overselling is impossible at the storage layer -------------
ALTER TABLE "inventory_items"
  ADD CONSTRAINT "inventory_on_hand_nonneg" CHECK ("quantity_on_hand" >= 0);
--> statement-breakpoint
ALTER TABLE "inventory_items"
  ADD CONSTRAINT "inventory_reserved_nonneg" CHECK ("quantity_reserved" >= 0);
--> statement-breakpoint
ALTER TABLE "inventory_items"
  ADD CONSTRAINT "inventory_reserved_le_on_hand" CHECK ("quantity_on_hand" >= "quantity_reserved");
--> statement-breakpoint
ALTER TABLE "stock_reservations"
  ADD CONSTRAINT "reservation_qty_positive" CHECK ("quantity" > 0);
--> statement-breakpoint

-- ---- Money: totals cannot drift, prices cannot go negative -----------------
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_total_consistent"
  CHECK ("total_minor" = "subtotal_minor" + "delivery_fee_minor" + "tax_minor" - "discount_minor");
--> statement-breakpoint
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_amounts_nonneg"
  CHECK ("subtotal_minor" >= 0 AND "delivery_fee_minor" >= 0 AND "tax_minor" >= 0
     AND "discount_minor" >= 0 AND "total_minor" >= 0);
--> statement-breakpoint
ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_qty_positive" CHECK ("quantity" > 0);
--> statement-breakpoint
ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_line_total" CHECK ("line_total_minor" = "unit_price_minor" * "quantity");
--> statement-breakpoint
ALTER TABLE "products"
  ADD CONSTRAINT "products_price_nonneg" CHECK ("price_minor" >= 0);
--> statement-breakpoint
ALTER TABLE "products"
  ADD CONSTRAINT "products_old_price_ge_price"
  CHECK ("old_price_minor" IS NULL OR "old_price_minor" >= "price_minor");
--> statement-breakpoint
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_nonneg" CHECK ("amount_minor" >= 0);
--> statement-breakpoint
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_refunded_le_amount"
  CHECK ("refunded_minor" >= 0 AND "refunded_minor" <= "amount_minor");
--> statement-breakpoint
ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_amount_positive" CHECK ("amount_minor" > 0);
--> statement-breakpoint
ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_rating_range" CHECK ("rating" BETWEEN 1 AND 5);
--> statement-breakpoint
ALTER TABLE "coupons"
  ADD CONSTRAINT "coupons_value_nonneg" CHECK ("value" >= 0);
--> statement-breakpoint

-- ---- Append-only enforcement (§35, §6) ------------------------------------
CREATE OR REPLACE FUNCTION "block_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only; % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "audit_logs_append_only"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "block_mutation"();
--> statement-breakpoint
CREATE TRIGGER "order_status_history_append_only"
  BEFORE UPDATE OR DELETE ON "order_status_history"
  FOR EACH ROW EXECUTE FUNCTION "block_mutation"();
--> statement-breakpoint
CREATE TRIGGER "stock_movements_append_only"
  BEFORE UPDATE OR DELETE ON "stock_movements"
  FOR EACH ROW EXECUTE FUNCTION "block_mutation"();
--> statement-breakpoint

-- ---- Refund cap: sum of a payment's refunds can never exceed the payment ---
CREATE OR REPLACE FUNCTION "enforce_refund_cap"() RETURNS trigger AS $$
DECLARE
  total_refunded bigint;
  pay_amount bigint;
BEGIN
  SELECT COALESCE(SUM("amount_minor"), 0) INTO total_refunded
    FROM "refunds"
   WHERE "payment_id" = NEW."payment_id" AND "status" <> 'failed';
  SELECT "amount_minor" INTO pay_amount FROM "payments" WHERE "id" = NEW."payment_id";
  IF pay_amount IS NULL THEN
    RAISE EXCEPTION 'Refund references unknown payment %', NEW."payment_id";
  END IF;
  IF total_refunded > pay_amount THEN
    RAISE EXCEPTION 'Refund total (%) exceeds payment amount (%)', total_refunded, pay_amount
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "refunds_cap_check"
  AFTER INSERT OR UPDATE ON "refunds"
  FOR EACH ROW EXECUTE FUNCTION "enforce_refund_cap"();
--> statement-breakpoint

-- ---- Full-text + trigram search over products (§27) -----------------------
ALTER TABLE "products" ADD COLUMN "search_vector" tsvector;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "products_search_vector_update"() RETURNS trigger AS $$
BEGIN
  NEW."search_vector" :=
      setweight(to_tsvector('simple', coalesce(NEW."name_ar", '')), 'A')
    || setweight(to_tsvector('simple', coalesce(NEW."name_en", '')), 'A')
    || setweight(to_tsvector('simple', coalesce(NEW."brand_ar", '')), 'B')
    || setweight(to_tsvector('simple', coalesce(NEW."brand_en", '')), 'B')
    || setweight(to_tsvector('simple', coalesce(NEW."description_ar", '')), 'C')
    || setweight(to_tsvector('simple', coalesce(NEW."description_en", '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "products_search_vector_trg"
  BEFORE INSERT OR UPDATE ON "products"
  FOR EACH ROW EXECUTE FUNCTION "products_search_vector_update"();
--> statement-breakpoint
CREATE INDEX "products_search_vector_idx" ON "products" USING gin ("search_vector");
--> statement-breakpoint
CREATE INDEX "products_name_ar_trgm_idx" ON "products" USING gin ("name_ar" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "products_name_en_trgm_idx" ON "products" USING gin ("name_en" gin_trgm_ops);
--> statement-breakpoint

-- ---- Partial indexes for hot filtered paths (§26) -------------------------
CREATE INDEX "sessions_active_idx" ON "sessions" ("user_id") WHERE "revoked_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "stock_reservations_active_idx" ON "stock_reservations" ("expires_at")
  WHERE "status" = 'held';
--> statement-breakpoint
CREATE INDEX "products_active_visible_idx" ON "products" ("store_id", "category_id")
  WHERE "is_active" = true AND "is_visible" = true AND "deleted_at" IS NULL;
