-- 0003_credentials — encrypted provider credentials managed from the admin panel.
CREATE TABLE IF NOT EXISTS "provider_credentials" (
  "id" text PRIMARY KEY NOT NULL,
  "store_id" text DEFAULT 'store_default' NOT NULL,
  "provider" text NOT NULL,
  "key_name" text NOT NULL,
  "value_encrypted" text NOT NULL,
  "updated_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "provider_credentials_uidx" ON "provider_credentials" ("store_id","provider","key_name");
