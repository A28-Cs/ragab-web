# Error Codes

Stable, machine-readable codes returned in `error.code`. Messages are bilingual (ar/en). HTTP status is derived from the error category.

| Code | HTTP | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Input failed schema validation (details list the fields) |
| `MALFORMED_JSON` | 400 | Request body was not valid JSON |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | A money mutation needs an `Idempotency-Key` header |
| `UNAUTHENTICATED` | 401 | No valid session |
| `INVALID_CREDENTIALS` | 401 | Wrong phone/password (identical for unknown users) |
| `ACCOUNT_DISABLED` | 401 | Account suspended/disabled |
| `REAUTH_REQUIRED` | 401 | Step-up re-authentication failed (e.g. refunds, account deletion) |
| `TWO_FACTOR_REQUIRED` | 401 | Account deletion on a 2FA account needs a `code` alongside the password |
| `CSRF_ORIGIN_MISMATCH` / `CSRF_TOKEN_INVALID` | 401 | CSRF checks failed |
| `FORBIDDEN` | 403 | Authenticated but lacks the required permission |
| `PRODUCT_NOT_FOUND` / `ORDER_NOT_FOUND` / `ADDRESS_NOT_FOUND` / … | 404 | Resource missing OR not owned (no existence disclosure) |
| `PHONE_ALREADY_REGISTERED` | 409 | Registration conflict |
| `IDEMPOTENCY_KEY_REUSE` | 409 | Same key, different body |
| `IDEMPOTENT_REQUEST_IN_PROGRESS` | 409 | Concurrent retry of an in-flight request |
| `INSUFFICIENT_STOCK` | 422 | Requested quantity exceeds available |
| `INVALID_STATUS_TRANSITION` | 422 | Disallowed order state change |
| `INVALID_PAYMENT_TRANSITION` | 422 | Disallowed payment state change |
| `CART_EMPTY` / `COD_DISABLED` / `STORE_MAINTENANCE` | 422 | Checkout preconditions |
| `COUPON_INVALID` / `COUPON_EXPIRED` / `COUPON_EXHAUSTED` / `COUPON_MIN_ORDER` / `COUPON_PER_USER_LIMIT` | 404/422 | Coupon validation |
| `ORDER_NOT_PAID` / `REFUND_AMOUNT_INVALID` / `REFUND_FAILED` | 422 | Refund preconditions/outcome |
| `ROLE_SYSTEM_PROTECTED` / `ROLE_IN_USE` | 422 | Role deletion guards |
| `RATE_LIMITED` | 429 | Too many requests (Retry-After header set) |
| `PAYMOB_NOT_CONFIGURED` / `PAYMOB_UNREACHABLE` / `PAYMOB_INTENT_FAILED` | 502 | Payment provider errors |
| `INTERNAL_ERROR` | 500 | Unexpected error (details in logs only) |
