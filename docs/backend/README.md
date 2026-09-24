# Ragab Backend

Production backend for the Ragab grocery store: **Next.js 16 route handlers over PostgreSQL**, in the `@ragab/server` workspace package. Money is exact (integer minor units), the database is the last line of defense (CHECK constraints + triggers), and every request flows through one authorization/validation choke point.

> This is a security-first design. It does **not** claim to be free of vulnerabilities; it aims to reduce risk to a low, testable level with defense in depth. See [threat-model.md](./threat-model.md).

---

## Stack

| Concern | Choice |
| --- | --- |
| API | Next.js 16 App Router route handlers (`apps/web/src/app/api/v1/**`) |
| Language | TypeScript, `strict` |
| DB | PostgreSQL 16, [Drizzle ORM](https://orm.drizzle.team) + `postgres.js` |
| Cache / rate limit / queues | Redis (ioredis), BullMQ |
| Passwords | Argon2id (`@node-rs/argon2`) |
| Payments | Paymob (Unified Intention) + COD + manual transfer |
| Object storage | S3 / MinIO |
| Validation | Zod |
| Tests | Vitest (+ real Postgres/Redis) |

## Layout

```
packages/server/src/
  config/env.ts        Zod-validated env, fail-fast at boot
  lib/                 money, errors, logger, ids, pagination, idempotency, redis, clock
  db/                  schema/*.ts, migrations/*.sql, client.ts, migrate.ts, seed.ts
  security/            password, tokens, session, csrf, rateLimit, headers, sanitize, permissions
  http/                handler.ts (defineRoute), context.ts, responses.ts
  modules/<domain>/    schema.ts (Zod) · service.ts · repository.ts · mapper.ts · index.ts · __tests__
  jobs/                queues.ts, worker.ts, processors/*
apps/web/src/app/api/v1/**/route.ts   thin route adapters (parse → authorize → call service → serialize)
apps/web/src/proxy.ts                 edge proxy: security headers + CSRF cookie
apps/worker/                          worker/migrate Docker image
```

**Layering:** `http → modules → lib / security / db`. Route handlers contain no business logic. A module composes other modules through their **service** layer but never imports the HTTP handler (enforced by ESLint).

## The request choke point — `defineRoute`

Every route is declared with `defineRoute({ … })`, which runs, in order:

1. build request context (correlation id, principal resolution from the session cookie)
2. **rate limit** (Redis sliding window)
3. **CSRF** — same-origin check + double-submit token (mutating methods)
4. **authentication** (`auth: 'required' | 'optional' | 'none'`)
5. **authorization** (`permission: { resource, action }` → RBAC check on a staff principal)
6. **validation** — Zod parse of body/query/params (`.strict()` ⇒ mass-assignment safe)
7. **idempotency** — claim/replay by `Idempotency-Key` (money mutations)
8. run handler, serialize, persist idempotent result
9. map any error to a safe envelope + structured access log

A route physically cannot skip a check — they are the wrapper's job, not the handler's.

## Response contract

Success: `{ "success": true, "data": <T>, "requestId": "…" }`
Error: `{ "success": false, "error": { "code": "STABLE_CODE", "message": { "ar": "…", "en": "…" }, "requestId": "…" } }`

Stack traces and internal messages never reach the client — only a stable code + bilingual message. See [error-codes.md](./error-codes.md).

## Money

Stored as `BIGINT` **piastres** (EGP minor unit). All arithmetic goes through `lib/money.ts` (`Money`), which is integer-only. The API projects to major-unit `number` at the mapper boundary. Every order carries a DB CHECK: `total = subtotal + delivery + tax − discount`.

## Data integrity — the DB as last line of defense

Hand-authored `db/migrations/0001_integrity.sql` adds what the app cannot bypass:

- `inventory_items`: `CHECK (quantity_on_hand >= quantity_reserved)` ⇒ **overselling impossible**
- `payments`: `CHECK (refunded_minor <= amount_minor)` + a trigger capping `SUM(refunds)` ⇒ **no over-refund**
- `audit_logs`, `order_status_history`, `stock_movements`: **append-only** (UPDATE/DELETE blocked by trigger)
- `payment_webhook_events`: `UNIQUE (provider, provider_event_id)` ⇒ **webhook dedupe by the DB**
- `products.search_vector` (tsvector) + GIN trigram indexes ⇒ Arabic-aware search

These are verified by tests: N concurrent reservations for 1 unit yield exactly 1 order; a tampered audit row is rejected; a duplicate webhook is a no-op.

## Key flows

- **Auth** (§9/§10): Argon2id, opaque DB-backed sessions (SHA-256-hashed tokens, sliding + absolute expiry, instant revocation), anti-enumeration login, phone OTP, password reset, session listing/revocation. Registration **always** creates a customer — staff are provisioned only via the admin users module.
- **Cart** (§8): server-authoritative. `cart_items` store only `product_id + quantity`; every read reprices from live data via the shared pricing engine. The client cart is a cache.
- **Checkout** (§21/§22): `quote` (preview, no writes) → `placeOrder` (one transaction: reserve stock → create order+items+history → redeem coupon → commit; payment init **after** commit). Guarded by `Idempotency-Key`.
- **Payments** (§17–§20): `PaymentProvider` interface with COD / Paymob / manual-transfer adapters. Paymob webhooks are verified by **HMAC-SHA512** over the documented field order before anything is parsed; events are deduped and processed idempotently.
- **Refunds** (§18/§46): full/partial, step-up re-auth, restock, DB-enforced cap.

## Running locally

```bash
docker compose up -d postgres redis minio
cp .env.example .env      # fill SESSION_SECRET, CSRF_SECRET (32+ bytes), Paymob keys
npm ci
npm run db:migrate && npm run db:seed
npm run dev               # storefront + control-center on :3000
npm run worker            # in another shell: BullMQ worker
```

Seeded accounts: Super Admin `01000000000` / `Admin@12345`, demo customer `01011111111` / `Customer@123` (change in production).

## Testing

```bash
npm test                  # unit (money, pricing, permissions, state machine, Paymob HMAC)
npm run test:integration  # real Postgres: auth, catalog, cart, checkout, concurrency, webhooks
```

Integration tests need `DATABASE_URL`. They run serially (`fileParallelism: false`) because they share one database.

## See also

- [credentials.md](./credentials.md) — API keys & secrets manager (encryption, masking, per-provider tests)
- [threat-model.md](./threat-model.md) — assets, actors, trust boundaries, threats, mitigations
- [error-codes.md](./error-codes.md) — stable error code reference
- [deployment.md](./deployment.md) — deploy, health checks, backup/PITR, restore drill, DR
- `.env.example` — full environment variable reference (names + shape)
