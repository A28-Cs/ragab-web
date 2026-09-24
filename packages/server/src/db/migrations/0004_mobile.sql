-- 0004_mobile — native mobile client support (§24, §26). Additive & idempotent.
-- Push device tokens + push notification preference columns.
CREATE TYPE "device_platform" AS ENUM ('android', 'ios', 'web');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "device_tokens" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "token" text NOT NULL,
  "platform" "device_platform" NOT NULL,
  "device_id" text,
  "app_version" text,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "device_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "device_tokens_token_uidx" ON "device_tokens" ("token");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "device_tokens_user_idx" ON "device_tokens" ("user_id");
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN IF NOT EXISTS "order_push" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN IF NOT EXISTS "promo_push" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN IF NOT EXISTS "security_push" boolean DEFAULT true NOT NULL;
