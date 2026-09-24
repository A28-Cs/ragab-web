-- 0011_house_photo — optional customer house photo, so couriers can find the address.
-- Additive & idempotent.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "house_image" text;
