# API Reference (`/api/v1`)

All responses use the envelope in [README](./README.md#response-contract). Mutating requests require the `ragab_csrf` cookie echoed in an `X-CSRF-Token` header (the edge proxy sets the cookie) and a same-origin `Origin`. Money mutations require an `Idempotency-Key` header. Auth is via the `ragab_session` HttpOnly cookie.

**Native (mobile) clients** authenticate differently: they send `Authorization: Bearer <token>` plus `X-Ragab-Client: mobile`, and are exempt from the CSRF/same-origin checks (a Bearer token is not an ambient credential — see [threat model](./threat-model.md#native-mobile-client--a-second-transport)). `login`/`register`/`2fa/verify-login` return `{ user, session: { token, expiresAt } }` to native clients (browsers get the token as an HttpOnly cookie instead). Native clients should also send a stable `X-Device-Id` (used for CGNAT-safe rate limiting) and an `Idempotency-Key` on checkout.

Legend: **none** = public · **opt** = resolves session if present · **auth** = login required · `resource:action` = staff RBAC permission.

## Health

| Method | Path | Access |
| --- | --- | --- |
| GET | `/api/health` | none — liveness |
| GET | `/api/ready` | none — readiness (DB/Redis) |

## Auth

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/register` | none | rate-limited; always creates a customer |
| POST | `/api/v1/auth/login` | none | rate-limited (fail-closed); sets session + CSRF cookies |
| POST | `/api/v1/auth/logout` | opt | revokes session, clears cookies |
| GET | `/api/v1/auth/me` | auth | `{ user, permissions[] }` |
| POST | `/api/v1/auth/verify-phone` | auth | OTP |
| POST | `/api/v1/auth/change-password` | auth | revokes other sessions |
| POST | `/api/v1/auth/password-reset` | none | anti-enumeration (always 200) |
| POST | `/api/v1/auth/password-reset/confirm` | none | single-use token |
| GET | `/api/v1/auth/sessions` | auth | device/session list |
| DELETE | `/api/v1/auth/sessions/[id]` | auth | revoke own session only |
| DELETE | `/api/v1/auth/account` | auth | rate-limited (fail-closed); re-auth via `reauthPassword` (+ 2FA `code` when enabled); anonymizes PII, purges account data, revokes all sessions; orders survive anonymized |

## Catalog (public reads)

| Method | Path | Access |
| --- | --- | --- |
| GET | `/api/v1/products` | none — filters mirror `ProductFilters`; keyset paginated |
| POST | `/api/v1/products` | `products:create` |
| GET | `/api/v1/products/[slug]` | none |
| PATCH / DELETE | `/api/v1/products/[slug]` | `products:edit` / `products:delete` (soft delete) |
| GET | `/api/v1/products/popular` `/essential` `/offers` | none |
| GET / POST | `/api/v1/categories` | none / `categories:create` |
| GET | `/api/v1/offers` | none |
| GET | `/api/v1/delivery-zones` | none |
| POST | `/api/v1/coupons/validate` | opt — rate-limited |
| GET | `/api/v1/products/suggest` | none — search autocomplete (`?q=&limit=`) |

## Wishlist (§23 — shared by web and mobile)

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/wishlist` | auth | returns the hydrated `Product[]` |
| POST | `/api/v1/wishlist` | auth | `{ productId }`; returns updated `Product[]` |
| DELETE | `/api/v1/wishlist/[productId]` | auth | returns updated `Product[]` |
| POST | `/api/v1/wishlist/merge` | auth | `{ productIds[] }`; folds a local list up on first login |

## Mobile support

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/app/config` | none | version gate + store state + feature flags (§47) |
| POST | `/api/v1/devices` | auth | register/refresh an FCM token (§26) |
| DELETE | `/api/v1/devices` | auth | remove this device's token on logout |
| GET | `/.well-known/assetlinks.json` | none | Android App Links (§25) |
| GET | `/.well-known/apple-app-site-association` | none | iOS Universal Links (§25) |

## Cart (server-authoritative)

| Method | Path | Access |
| --- | --- | --- |
| GET | `/api/v1/cart` | opt — returns priced cart |
| DELETE | `/api/v1/cart` | opt — clear |
| POST / PATCH | `/api/v1/cart/items` | opt — add / set quantity |
| DELETE | `/api/v1/cart/items/[productId]` | opt |

## Checkout & Orders

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| POST | `/api/v1/checkout/quote` | auth | preview totals, no writes |
| POST | `/api/v1/checkout` | auth | **Idempotency-Key required**; places order + inits payment |
| GET | `/api/v1/orders` | auth | own orders (scoped) |
| GET | `/api/v1/orders/[id]` | auth | own order; else 404 |
| POST | `/api/v1/orders/[id]/cancel` | auth | only while pending |

## Account

| Method | Path | Access |
| --- | --- | --- |
| GET / POST | `/api/v1/addresses` | auth |
| PUT / DELETE | `/api/v1/addresses/[id]` | auth (owner-scoped) |
| GET | `/api/v1/notifications` | auth |
| POST | `/api/v1/notifications/[id]/read`, `/read-all` | auth |

## Admin (Control Center)

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/api/v1/admin/orders` | `orders:view` |
| PATCH | `/api/v1/admin/orders/[id]/status` | `orders:edit` (state machine) |
| POST | `/api/v1/admin/refunds` | `payments:approve` (+ re-auth) |
| GET | `/api/v1/admin/customers` | `customers:view` |
| POST | `/api/v1/admin/customers/[id]/status` | `customers:edit` |
| GET / POST | `/api/v1/admin/roles` | `roles:view` / `roles:create` |
| PUT / DELETE | `/api/v1/admin/roles/[id]` | `roles:edit` / `roles:delete` |
| GET / POST | `/api/v1/admin/staff` | `users:view` / `users:create` |
| PATCH | `/api/v1/admin/staff/[id]` | `users:edit` |
| GET / PATCH | `/api/v1/admin/settings` | `settings:view` / `settings:edit` |
| POST | `/api/v1/admin/inventory/[id]/adjust` | `inventory:edit` |
| GET | `/api/v1/admin/credentials` | `integrations:view` (masked keys — see [credentials.md](./credentials.md)) |
| PUT | `/api/v1/admin/credentials/[provider]` | `integrations:manage` |
| POST | `/api/v1/admin/credentials/[provider]/test` | `integrations:manage` |
| GET / PATCH | `/api/v1/admin/integrations` + `/[id]` | `integrations:view` / `integrations:edit` |
| GET | `/api/v1/admin/audit` | `audit:view` |
| GET | `/api/v1/admin/reports/sales` | `reports:view` |

## Webhooks

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/api/v1/webhooks/paymob` | HMAC-SHA512 signature (no session/CSRF) |
