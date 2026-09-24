CREATE TYPE "public"."account_status" AS ENUM('active', 'suspended', 'disabled', 'pending_verification');--> statement-breakpoint
CREATE TYPE "public"."fulfillment_status" AS ENUM('unfulfilled', 'processing', 'ready', 'out_for_delivery', 'fulfilled', 'returned');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'preparing', 'on_the_way', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cod', 'vodafone_cash', 'instapay', 'card');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'authorized', 'paid', 'failed', 'refunded', 'partially_refunded');--> statement-breakpoint
CREATE TYPE "public"."stock_movement_type" AS ENUM('purchase', 'sale', 'reservation', 'reservation_release', 'adjustment', 'return', 'refund_restock');--> statement-breakpoint
CREATE TYPE "public"."audit_result" AS ENUM('success', 'failure');--> statement-breakpoint
CREATE TYPE "public"."login_activity_result" AS ENUM('success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."token_purpose" AS ENUM('email_verification', 'phone_verification', 'password_reset');--> statement-breakpoint
CREATE TYPE "public"."role_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('held', 'committed', 'released', 'expired');--> statement-breakpoint
CREATE TYPE "public"."shipment_status" AS ENUM('pending', 'assigned', 'out_for_delivery', 'delivered', 'failed');--> statement-breakpoint
CREATE TYPE "public"."return_status" AS ENUM('requested', 'approved', 'rejected', 'received', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."payment_intent_status" AS ENUM('created', 'requires_action', 'processing', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('cod', 'paymob', 'manual_transfer');--> statement-breakpoint
CREATE TYPE "public"."coupon_type" AS ENUM('percentage', 'fixed', 'free_delivery');--> statement-breakpoint
CREATE TYPE "public"."notification_category" AS ENUM('order', 'promo', 'account', 'security', 'general');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text DEFAULT 'store_default' NOT NULL,
	"actor_id" text,
	"actor_name" text NOT NULL,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"resource" text NOT NULL,
	"resource_id" text,
	"target" text,
	"result" "audit_result" DEFAULT 'success' NOT NULL,
	"request_id" text,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb,
	"prev_hash" text,
	"entry_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"description_ar" text,
	"description_en" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"key" text NOT NULL,
	"scope" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"locked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text DEFAULT 'store_default' NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"description_ar" text DEFAULT '' NOT NULL,
	"description_en" text DEFAULT '' NOT NULL,
	"category" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"connected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_settings" (
	"id" text PRIMARY KEY DEFAULT 'store_default' NOT NULL,
	"store_name_ar" text NOT NULL,
	"store_name_en" text NOT NULL,
	"phone" text NOT NULL,
	"whatsapp" text NOT NULL,
	"address_ar" text NOT NULL,
	"delivery_fee_minor" bigint DEFAULT 1500 NOT NULL,
	"free_delivery_threshold_minor" bigint DEFAULT 30000 NOT NULL,
	"working_hours" text DEFAULT '' NOT NULL,
	"cod_enabled" boolean DEFAULT true NOT NULL,
	"online_payments_enabled" boolean DEFAULT true NOT NULL,
	"maintenance_mode" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" text PRIMARY KEY NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"slug" text NOT NULL,
	"currency" text DEFAULT 'EGP' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stores_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tax_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text DEFAULT 'store_default' NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"rate_bps" integer DEFAULT 0 NOT NULL,
	"inclusive" boolean DEFAULT true NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"identifier" text,
	"device" text DEFAULT '' NOT NULL,
	"browser" text DEFAULT '' NOT NULL,
	"approx_location" text,
	"ip_address" text,
	"result" "login_activity_result" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mfa_secrets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"secret_encrypted" text NOT NULL,
	"recovery_codes_hashed" text[],
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mfa_secrets_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"total_spent_minor" text DEFAULT '0' NOT NULL,
	"orders_count" text DEFAULT '0' NOT NULL,
	"marketing_consent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"device" text DEFAULT 'Unknown' NOT NULL,
	"device_type" text DEFAULT 'desktop' NOT NULL,
	"browser" text DEFAULT '' NOT NULL,
	"approx_location" text,
	"ip_address" text,
	"user_agent" text,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text DEFAULT 'store_default' NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"password_hash" text,
	"default_village" text DEFAULT '' NOT NULL,
	"avatar" text,
	"date_of_birth" text,
	"preferred_language" text DEFAULT 'ar' NOT NULL,
	"status" "account_status" DEFAULT 'pending_verification' NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"phone_verified" boolean DEFAULT false NOT NULL,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"role_id" text,
	"is_staff" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"purpose" "token_purpose" NOT NULL,
	"token_hash" text NOT NULL,
	"attempts" text DEFAULT '0' NOT NULL,
	"consumed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" text PRIMARY KEY NOT NULL,
	"resource" text NOT NULL,
	"action" text NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" text NOT NULL,
	"permission_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text DEFAULT 'store_default' NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"description_ar" text DEFAULT '' NOT NULL,
	"description_en" text DEFAULT '' NOT NULL,
	"is_wildcard" boolean DEFAULT false NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"status" "role_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_direct_permissions" (
	"user_id" text NOT NULL,
	"permission_key" text NOT NULL,
	"granted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" text NOT NULL,
	"role_id" text NOT NULL,
	"assigned_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text DEFAULT 'store_default' NOT NULL,
	"slug" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text,
	"logo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text DEFAULT 'store_default' NOT NULL,
	"slug" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"description_ar" text,
	"description_en" text,
	"icon_name" text DEFAULT 'package' NOT NULL,
	"image" text,
	"color_theme" text,
	"parent_id" text,
	"featured" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "product_attribute_values" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"attribute_id" text NOT NULL,
	"value_ar" text NOT NULL,
	"value_en" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_attributes" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text DEFAULT 'store_default' NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"url" text NOT NULL,
	"alt_ar" text,
	"alt_en" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"sku" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text,
	"price_minor" bigint NOT NULL,
	"old_price_minor" bigint,
	"unit_ar" text,
	"unit_en" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text DEFAULT 'store_default' NOT NULL,
	"sku" text NOT NULL,
	"slug" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text,
	"category_id" text NOT NULL,
	"brand_id" text,
	"brand_ar" text,
	"brand_en" text,
	"unit_ar" text NOT NULL,
	"unit_en" text NOT NULL,
	"unit_value" real,
	"unit_measure" text,
	"price_minor" bigint NOT NULL,
	"old_price_minor" bigint,
	"currency" text DEFAULT 'EGP' NOT NULL,
	"image" text DEFAULT '' NOT NULL,
	"description_ar" text DEFAULT '' NOT NULL,
	"description_en" text,
	"origin_ar" text,
	"is_popular" boolean DEFAULT false NOT NULL,
	"is_essential" boolean DEFAULT false NOT NULL,
	"is_new" boolean DEFAULT false NOT NULL,
	"badge_ar" text,
	"badge_en" text,
	"tags" text[],
	"rating" real,
	"review_count" integer DEFAULT 0 NOT NULL,
	"low_stock_threshold" integer DEFAULT 5 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "inventory_adjustments" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"warehouse_id" text DEFAULT 'wh_default' NOT NULL,
	"previous_quantity" integer NOT NULL,
	"new_quantity" integer NOT NULL,
	"reason" text NOT NULL,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"warehouse_id" text DEFAULT 'wh_default' NOT NULL,
	"quantity_on_hand" integer DEFAULT 0 NOT NULL,
	"quantity_reserved" integer DEFAULT 0 NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"warehouse_id" text DEFAULT 'wh_default' NOT NULL,
	"type" "stock_movement_type" NOT NULL,
	"quantity_delta" integer NOT NULL,
	"reason" text,
	"reference_type" text,
	"reference_id" text,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"warehouse_id" text DEFAULT 'wh_default' NOT NULL,
	"order_id" text,
	"cart_id" text,
	"quantity" integer NOT NULL,
	"status" "reservation_status" DEFAULT 'held' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text DEFAULT 'store_default' NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"is_default" text DEFAULT 'false' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" text PRIMARY KEY NOT NULL,
	"cart_id" text NOT NULL,
	"product_id" text NOT NULL,
	"variant_id" text,
	"quantity" integer NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text DEFAULT 'store_default' NOT NULL,
	"user_id" text,
	"anonymous_token" text,
	"status" text DEFAULT 'active' NOT NULL,
	"converted_order_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wishlist_items" (
	"id" text PRIMARY KEY NOT NULL,
	"wishlist_id" text NOT NULL,
	"product_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wishlists" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wishlists_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "addresses" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"label" text,
	"recipient_name" text NOT NULL,
	"phone" text NOT NULL,
	"village" text NOT NULL,
	"street_address" text NOT NULL,
	"landmark" text,
	"notes" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_zones" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text DEFAULT 'store_default' NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"delivery_fee_minor" bigint NOT NULL,
	"min_order_minor" bigint DEFAULT 0 NOT NULL,
	"estimated_time_ar" text DEFAULT '' NOT NULL,
	"estimated_time_en" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipment_events" (
	"id" text PRIMARY KEY NOT NULL,
	"shipment_id" text NOT NULL,
	"status" "shipment_status" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"zone_id" text,
	"driver_name" text,
	"driver_phone" text,
	"status" "shipment_status" DEFAULT 'pending' NOT NULL,
	"estimated_delivery" text,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipping_methods" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text DEFAULT 'store_default' NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"base_fee_minor" bigint DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"product_id" text,
	"variant_id" text,
	"product_name_ar" text NOT NULL,
	"product_name_en" text,
	"unit" text NOT NULL,
	"image" text DEFAULT '' NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_minor" bigint NOT NULL,
	"line_total_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"author_id" text,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"is_internal" text DEFAULT 'true' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"kind" text DEFAULT 'order' NOT NULL,
	"actor_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text DEFAULT 'store_default' NOT NULL,
	"order_number" text NOT NULL,
	"user_id" text,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"payment_status" "payment_status" DEFAULT 'pending' NOT NULL,
	"fulfillment_status" "fulfillment_status" DEFAULT 'unfulfilled' NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"currency" text DEFAULT 'EGP' NOT NULL,
	"subtotal_minor" bigint NOT NULL,
	"delivery_fee_minor" bigint DEFAULT 0 NOT NULL,
	"tax_minor" bigint DEFAULT 0 NOT NULL,
	"discount_minor" bigint DEFAULT 0 NOT NULL,
	"total_minor" bigint NOT NULL,
	"coupon_code" text,
	"delivery_address" jsonb NOT NULL,
	"estimated_delivery" text DEFAULT '' NOT NULL,
	"notes" text,
	"manual" text DEFAULT 'false' NOT NULL,
	"refunded" text DEFAULT 'false' NOT NULL,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "return_items" (
	"id" text PRIMARY KEY NOT NULL,
	"return_id" text NOT NULL,
	"order_item_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "returns" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"status" "return_status" DEFAULT 'requested' NOT NULL,
	"reason" text,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"method" "payment_method" NOT NULL,
	"status" "payment_intent_status" DEFAULT 'created' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text DEFAULT 'EGP' NOT NULL,
	"provider_intent_id" text,
	"provider_client_secret" text,
	"idempotency_key" text,
	"metadata" jsonb,
	"version" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_id" text,
	"order_id" text,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"provider_txn_id" text,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text,
	"signature_verified" text DEFAULT 'false' NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"processing_error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"intent_id" text,
	"provider" "payment_provider" NOT NULL,
	"method" "payment_method" NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"refunded_minor" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'EGP' NOT NULL,
	"provider_payment_id" text,
	"captured_at" timestamp with time zone,
	"failure_reason" text,
	"version" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_id" text NOT NULL,
	"order_id" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider_refund_id" text,
	"actor_id" text,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupon_redemptions" (
	"id" text PRIMARY KEY NOT NULL,
	"coupon_id" text NOT NULL,
	"user_id" text,
	"order_id" text NOT NULL,
	"discount_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text DEFAULT 'store_default' NOT NULL,
	"code" text NOT NULL,
	"type" "coupon_type" NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"min_order_minor" bigint DEFAULT 0 NOT NULL,
	"max_discount_minor" bigint,
	"usage_limit" integer,
	"per_user_limit" integer DEFAULT 1 NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotion_categories" (
	"coupon_id" text NOT NULL,
	"category_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotion_products" (
	"coupon_id" text NOT NULL,
	"product_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotion_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"coupon_id" text NOT NULL,
	"rule_type" text NOT NULL,
	"config" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"to_address" text NOT NULL,
	"template" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"order_email" boolean DEFAULT true NOT NULL,
	"order_sms" boolean DEFAULT true NOT NULL,
	"promo_email" boolean DEFAULT false NOT NULL,
	"security_email" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"category" "notification_category" NOT NULL,
	"title_ar" text NOT NULL,
	"title_en" text NOT NULL,
	"body_ar" text NOT NULL,
	"body_en" text NOT NULL,
	"href" text,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_media" (
	"id" text PRIMARY KEY NOT NULL,
	"review_id" text NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"user_id" text NOT NULL,
	"rating" integer NOT NULL,
	"title" text,
	"body" text,
	"is_verified_purchase" boolean DEFAULT false NOT NULL,
	"is_approved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "login_activity" ADD CONSTRAINT "login_activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_secrets" ADD CONSTRAINT "mfa_secrets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_direct_permissions" ADD CONSTRAINT "user_direct_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_attribute_id_product_attributes_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "public"."product_attributes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_wishlist_id_wishlists_id_fk" FOREIGN KEY ("wishlist_id") REFERENCES "public"."wishlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_notes" ADD CONSTRAINT "order_notes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_return_id_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."returns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_intent_id_payment_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_categories" ADD CONSTRAINT "promotion_categories_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_products" ADD CONSTRAINT "promotion_products_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_rules" ADD CONSTRAINT "promotion_rules_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_media" ADD CONSTRAINT "review_media_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_resource_idx" ON "audit_logs" USING btree ("resource","resource_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_user_key_uidx" ON "idempotency_keys" USING btree ("user_id","key","scope");--> statement-breakpoint
CREATE INDEX "idempotency_expires_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "login_activity_user_idx" ON "login_activity" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_uidx" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_active_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_uidx" ON "users" USING btree ("store_id","phone");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uidx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_tokens_hash_uidx" ON "verification_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "verification_tokens_user_purpose_idx" ON "verification_tokens" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_key_uidx" ON "permissions" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "role_permissions_uidx" ON "role_permissions" USING btree ("role_id","permission_key");--> statement-breakpoint
CREATE INDEX "role_permissions_role_idx" ON "role_permissions" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_name_en_uidx" ON "roles" USING btree ("store_id","name_en");--> statement-breakpoint
CREATE UNIQUE INDEX "user_direct_permissions_uidx" ON "user_direct_permissions" USING btree ("user_id","permission_key");--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_uidx" ON "user_roles" USING btree ("user_id","role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brands_slug_uidx" ON "brands" USING btree ("store_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_uidx" ON "categories" USING btree ("store_id","slug");--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "product_attr_values_product_idx" ON "product_attribute_values" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_images_product_idx" ON "product_images" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_sku_uidx" ON "product_variants" USING btree ("sku");--> statement-breakpoint
CREATE UNIQUE INDEX "products_slug_uidx" ON "products" USING btree ("store_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "products_sku_uidx" ON "products" USING btree ("store_id","sku");--> statement-breakpoint
CREATE INDEX "products_category_active_idx" ON "products" USING btree ("store_id","category_id","is_active");--> statement-breakpoint
CREATE INDEX "products_flags_idx" ON "products" USING btree ("is_popular","is_essential");--> statement-breakpoint
CREATE INDEX "inventory_adjustments_product_idx" ON "inventory_adjustments" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_items_product_wh_uidx" ON "inventory_items" USING btree ("product_id","warehouse_id");--> statement-breakpoint
CREATE INDEX "stock_movements_product_idx" ON "stock_movements" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_reservations_order_idx" ON "stock_reservations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "stock_reservations_expiry_idx" ON "stock_reservations" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cart_items_uidx" ON "cart_items" USING btree ("cart_id","product_id","variant_id");--> statement-breakpoint
CREATE INDEX "carts_user_idx" ON "carts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "carts_anon_uidx" ON "carts" USING btree ("anonymous_token");--> statement-breakpoint
CREATE UNIQUE INDEX "wishlist_items_uidx" ON "wishlist_items" USING btree ("wishlist_id","product_id");--> statement-breakpoint
CREATE INDEX "addresses_user_idx" ON "addresses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shipment_events_shipment_idx" ON "shipment_events" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "shipments_order_idx" ON "shipments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_notes_order_idx" ON "order_notes" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_status_history_order_idx" ON "order_status_history" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_number_uidx" ON "orders" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "orders_user_created_idx" ON "orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_status_created_idx" ON "orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "orders_payment_status_idx" ON "orders" USING btree ("payment_status");--> statement-breakpoint
CREATE INDEX "returns_order_idx" ON "returns" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payment_intents_order_idx" ON "payment_intents" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payment_intents_provider_ref_idx" ON "payment_intents" USING btree ("provider_intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_idem_uidx" ON "payment_intents" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "payment_txns_payment_idx" ON "payment_transactions" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_event_uidx" ON "payment_webhook_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_provider_ref_idx" ON "payments" USING btree ("provider_payment_id");--> statement-breakpoint
CREATE INDEX "refunds_payment_idx" ON "refunds" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "refunds_order_idx" ON "refunds" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_idem_uidx" ON "refunds" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_redemptions_order_uidx" ON "coupon_redemptions" USING btree ("coupon_id","order_id");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_user_idx" ON "coupon_redemptions" USING btree ("coupon_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_code_uidx" ON "coupons" USING btree ("store_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "promotion_categories_uidx" ON "promotion_categories" USING btree ("coupon_id","category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "promotion_products_uidx" ON "promotion_products" USING btree ("coupon_id","product_id");--> statement-breakpoint
CREATE INDEX "email_events_user_idx" ON "email_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_user_product_uidx" ON "reviews" USING btree ("user_id","product_id");--> statement-breakpoint
CREATE INDEX "reviews_product_idx" ON "reviews" USING btree ("product_id");