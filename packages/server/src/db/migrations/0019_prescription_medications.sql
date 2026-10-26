ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "requires_prescription" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "prescription_instructions_ar" text;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "prescription_instructions_en" text;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "has_prescription_items" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "prescription_url" text;
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "requires_prescription" boolean NOT NULL DEFAULT false;
