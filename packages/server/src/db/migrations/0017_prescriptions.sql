DO $$ BEGIN
  CREATE TYPE "prescription_status" AS ENUM('pending', 'reviewed', 'completed', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "prescriptions" (
  "id" text PRIMARY KEY,
  "user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "customer_name" text NOT NULL,
  "customer_phone" text NOT NULL,
  "image_url" text NOT NULL,
  "notes" text,
  "status" "prescription_status" NOT NULL DEFAULT 'pending',
  "items" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "pharmacist_notes" text,
  "reviewed_by" text,
  "reviewed_at" timestamptz,
  "rejection_reason" text,
  "cart_updated" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prescriptions_user_idx" ON "prescriptions"("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prescriptions_status_idx" ON "prescriptions"("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prescriptions_created_idx" ON "prescriptions"("created_at");
