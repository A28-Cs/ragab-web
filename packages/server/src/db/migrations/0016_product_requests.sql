DO $$ BEGIN
  CREATE TYPE "product_request_status" AS ENUM('pending', 'fulfilled', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_requests" (
  "id" text PRIMARY KEY,
  "product_id" text NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "variant_id" text,
  "product_name_ar" text NOT NULL,
  "product_name_en" text,
  "customer_name" text NOT NULL,
  "customer_phone" text NOT NULL,
  "user_id" text,
  "notes" text,
  "status" "product_request_status" NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_requests_product_idx" ON "product_requests"("product_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_requests_status_idx" ON "product_requests"("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_requests_created_idx" ON "product_requests"("created_at");
