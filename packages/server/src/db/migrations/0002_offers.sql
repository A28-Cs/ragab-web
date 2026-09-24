-- 0002_offers — marketing offer banners (promotions page). Additive.
CREATE TABLE IF NOT EXISTS "offers" (
  "id" text PRIMARY KEY NOT NULL,
  "store_id" text DEFAULT 'store_default' NOT NULL,
  "slug" text NOT NULL,
  "title_ar" text NOT NULL,
  "title_en" text DEFAULT '' NOT NULL,
  "subtitle_ar" text DEFAULT '' NOT NULL,
  "subtitle_en" text DEFAULT '' NOT NULL,
  "discount_badge_ar" text DEFAULT '' NOT NULL,
  "discount_badge_en" text DEFAULT '' NOT NULL,
  "theme" text DEFAULT 'gold' NOT NULL,
  "expiry_date" text,
  "product_id" text,
  "category_id" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "offers_slug_uidx" ON "offers" ("store_id","slug");
