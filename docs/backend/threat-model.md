# Threat Model (§53)

Scope: the Ragab backend (`@ragab/server` + `apps/web` API routes) and its data store. This is a living document; it enumerates the primary assets, actors, trust boundaries, threats, and the concrete mitigations in the codebase. It does not assert the system is vulnerability-free.

## Assets

| Asset | Why it matters |
| --- | --- |
| Customer identities & credentials | Argon2id hashes; a leak must not yield plaintext or live sessions |
| Session tokens | Grant access as a user; stored only as SHA-256 hashes |
| Order & payment records | Financial truth; must be immutable and auditable |
| Inventory quantities | Overselling causes real fulfillment loss |
| Store money math | Prices/discounts/totals must be server-authoritative |
| Audit log | Tamper-evidence for admin actions |
| Secrets (DB, session, CSRF, Paymob) | Compromise breaks every other control |

## Actors

Guest · Customer · Staff (role-scoped) · Admin (Super Admin) · Payment provider (Paymob) · Email/SMS providers · External integrations · Attacker (external, or a lower-privileged insider).

## Trust boundaries

1. **Browser ↔ API** — nothing from the client is trusted: prices, permissions, statuses, identities are all re-derived server-side.
2. **API ↔ Database** — the app role has DML but cannot UPDATE/DELETE append-only tables; CHECK constraints hold regardless of app logic.
3. **API ↔ Payment provider** — only a signature-verified webhook (or a server-side inquiry) is authoritative; a client-reported payment status is ignored.
4. **API ↔ Worker** — the worker shares the DB/Redis but runs non-critical async work; business-critical consistency stays in synchronous transactions.

## Threats → mitigations

| Threat (OWASP / spec) | Mitigation |
| --- | --- |
| SQL injection | Parameterized queries via Drizzle; raw SQL only through bound `sql` templates |
| XSS | React contextual escaping + strict CSP (nonce) in the edge proxy; stored text stripped of control chars |
| CSRF (browser) | Same-origin check + double-submit token on every mutating route (`defineRoute`) for cookie-authenticated requests |
| CSRF (native transport) | Bearer-authenticated requests are exempt from CSRF — see "Native (mobile) client" below; a cookie request can NEVER gain the exemption |
| Broken access control / IDOR / BOLA | Ownership checks on every resource read/write; a customer requesting another's order gets **404** (no existence disclosure); admin routes require an RBAC permission on a staff principal |
| Vertical privilege escalation | Registration can never set `isStaff`/`roleId` (`.strict()` + hard invariant); role changes revoke the target's sessions |
| Client-side privilege escalation | Permissions come from the server `/me`, not a localStorage roleId; the dev RoleSwitcher is deleted |
| Authentication flaws / enumeration | Argon2id; identical login/reset responses + timing padding for unknown users; generic error codes |
| Brute force / credential stuffing | Redis rate limits on login/register/reset/OTP/coupon/checkout/payment (auth/payment fail **closed**) |
| Mass assignment | All input schemas `.strict()`; unknown keys rejected |
| Overselling / race conditions | Atomic reservation UPDATE guarded by availability + a DB CHECK; verified by concurrency tests |
| Duplicate orders/payments | `Idempotency-Key` claim/replay; unique constraints on redemptions and intents |
| Webhook forgery / replay | HMAC-SHA512 verified before parsing; `UNIQUE(provider, event_id)` dedupe; idempotent processing |
| Over-refund | `SUM(refunds) <= payment.amount` trigger + `refunded_minor` CHECK |
| Payment inconsistency (§52) | Payment status set only from verified events; a reconciliation job covers stuck intents; failed payment releases reserved stock |
| Sensitive data exposure | No card data stored (provider owns it); logger redaction allowlist; errors expose only stable codes |
| Security misconfiguration | Fail-fast env validation; secrets never in source; security headers via proxy |
| SSRF / open redirect | `isSafeOutboundUrl` / `safeRelativeRedirect` guards; the app never fetches client-supplied URLs |
| File upload abuse | Declared-type + magic-byte validation, size caps, random storage keys, served from a separate origin (upload module) |
| Tamper of financial/audit history | Append-only tables + hash-chained audit log |

## Native (mobile) client — a second transport

The Flutter app cannot use the browser's ambient session cookie + double-submit CSRF scheme
(it sends no `Origin`/`Referer` and holds no readable cookie). It instead authenticates with an
`Authorization: Bearer <token>` header, where the token is the *same* opaque DB session token the
cookie carries — resolved through the same `resolveSession`, revocable the same way, permissions
re-loaded on every request. Login/register/2FA return the token in the response body **only** to
native clients (identified by `X-Ragab-Client: mobile`); browser responses are byte-identical to
before.

**Why the CSRF exemption is safe.** CSRF exists only for *ambient* credentials the browser attaches
automatically. A Bearer token is not ambient — the app attaches it deliberately, and no cross-site
page can read or ride it. The exemption in `http/handler.ts` is therefore scoped precisely:

- Exempt when `authTransport === 'bearer'` (a real Bearer credential), **or** when the request is a
  native client carrying **no** cookie at all (native pre-session login/register).
- **Never** exempt a request that presents the ambient session cookie, even if it also sends
  `X-Ragab-Client: mobile`. So a same-origin script or an attacker who can set that header cannot
  use it to sidestep CSRF on a cookie session. (This is covered by a regression test.)
- A cross-origin browser cannot set `X-Ragab-Client` at all: a custom header forces a CORS
  preflight, and the server sends no `Access-Control-Allow-*` headers, so the preflight fails.

**Rate limiting under CGNAT.** Anonymous native auth (login/register) keys the limiter on the
sanitized per-install `X-Device-Id` folded with the IP (`dev:<id>:<ip>`), so the many users a mobile
carrier hides behind one NAT IP don't share a single 5/min login budget, while a single host
rotating device ids still can't mint unbounded buckets. Device ids are charset/length-bounded before
they touch a Redis key.

**Session lifetime.** Native sessions get a longer absolute cap
(`SESSION_MOBILE_ABSOLUTE_TTL_SECONDS`, default 90d) than browser sessions (30d) — re-login on a
phone is far costlier. The sliding window is unchanged; revocation is still instant.

**Push tokens (§26).** `device_tokens` holds one row per FCM registration token (globally unique).
Registration upserts on the token so a rotated token or a re-assigned device moves to the current
owner; logout deletes the caller's token; a token FCM reports invalid is pruned on the next send.

## Delivered since the initial core

- **2FA (TOTP)** — full enrollment/verify/disable + one-time recovery codes; login issues a signed challenge and completes via /auth/2fa/verify-login. Secrets encrypted at rest (AES-256-GCM). Integration-tested.
- **Email** — real SMTP via nodemailer (bilingual templates: verification, reset, order confirmation), recorded in email_events; safe no-op when SMTP is absent.
- **SMS** — provider-agnostic channel + logging adapter (swap in a gateway).
- **Image upload** — S3/MinIO with magic-byte validation, size cap, random keys; verified live (real PNG stored + fetched; disguised executable/text rejected).
- **E2E** — Playwright suite (storefront live data, register→account, admin→control-center) green in Chromium.

## Residual risks & follow-ups

- **Next 16 ↔ React 18** version mismatch (pre-existing); should be aligned to React 19.
- Paymob live webhook round-trip is unit-tested against HMAC vectors but requires sandbox credentials to validate end-to-end.
- SMS gateway is a stub until a real Egyptian provider (Twilio/SMSMisr/Vodafone) is configured.
- Payment reconciliation poll job for stuck non-terminal intents is a follow-up (webhook-driven confirmation works today).
- Reports run as bounded queries; move to materialized views under real load.
- Marketing offers are managed content; coupon-code discounts and offers are separate systems (both present).
