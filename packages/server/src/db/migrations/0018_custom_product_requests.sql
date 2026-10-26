ALTER TABLE "product_requests" ALTER COLUMN "product_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "product_requests" ADD COLUMN IF NOT EXISTS "image_url" text;
