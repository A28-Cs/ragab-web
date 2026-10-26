ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "prescription_status" text NOT NULL DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "prescription_rejection_reason" text;
