# API Keys & Secrets Manager (§33)

An admin surface (**Control Center → System → API Keys**, `/control-center/api-keys`) for configuring every integration's API keys / secrets / tokens from the panel — grouped by provider, each with a **Save** and a **Test connection** button. It exists so an operator can bring up Paymob, email, storage, or SMS without editing `.env` and redeploying.

## Security model

- **Encrypted at rest** — every value is stored as AES‑256‑GCM ciphertext (`security/crypto.ts`, key derived from `SESSION_SECRET` via scrypt). A raw DB dump never reveals a secret. Storage format: `base64(salt).base64(iv).base64(tag).base64(cipher)`.
- **Never returned in full** — the listing endpoint returns only `{ configured, source, masked }`. Secret values are masked to `••••` + the last 4 characters; non‑secret values (host, bucket, endpoint, from‑address) are shown as‑is. A test proves the full value appears **zero** times in the response.
- **Masked value never overwrites** — saving a field whose value still starts with `••••` is ignored, so re‑submitting the form without retyping a secret keeps the stored value.
- **Permission‑gated** — read requires `integrations:view`; write and test require `integrations:manage`.
- **Audited** — every change writes an audit entry recording *which keys* changed, never the values.
- **No leakage in logs** — the logger's redaction allowlist covers `secret`/`apiKey`/`token`/`password`, and test errors return a generic message.

## DB overrides env (no redeploy)

Credentials are read through `lib/credentials.ts` `getCredential(provider, keyName)`, which returns the **DB value if present, otherwise the matching `process.env` var**. Consumers wired to it — the **Paymob provider** (including the async webhook HMAC check), **email** (`lib/email.ts`), and **object storage** (`lib/storage.ts`) — pick up an admin change on the next request (a 30 s cache smooths reads; writes invalidate it). The `listProviderStatus` `source` field tells the operator whether each key currently comes from `db`, `env`, or is unset (`none`).

## Providers & keys

| Provider | Category | Keys | Required |
| --- | --- | --- | --- |
| **Paymob** | payment | `PAYMOB_API_KEY`*, `PAYMOB_SECRET_KEY`*, `PAYMOB_PUBLIC_KEY`, `PAYMOB_HMAC_SECRET`* | all four |
| **Email (SMTP)** | messaging | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`*, `SMTP_FROM` | host |
| **Object Storage (S3/MinIO)** | storage | `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`*, `S3_SECRET_ACCESS_KEY`*, `S3_BUCKET`, `S3_PUBLIC_URL` | access + secret |
| **SMS Gateway** | messaging | `SMS_PROVIDER`, `SMS_API_KEY`*, `SMS_SENDER` | provider + key |

`*` = secret (masked). The registry lives in `modules/credentials/service.ts` (`PROVIDERS`); add a provider or key there and it appears in the UI automatically.

## Connection tests

`POST /admin/credentials/[provider]/test` runs a real, side‑effect‑free check using the effective credentials and returns `{ ok, message: { ar, en } }` — never a secret:

- **Paymob** — `POST {base}/api/auth/tokens` with the API key; a returned token means the key is valid.
- **SMTP** — `nodemailer.transporter.verify()` (connection + auth).
- **S3** — `HeadBucketCommand` on the bucket.
- **SMS** — reports configured/not‑configured (a live send is provider‑specific).

## API

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/api/v1/admin/credentials` | `integrations:view` — masked status of every provider/key |
| PUT | `/api/v1/admin/credentials/[provider]` | `integrations:manage` — `{ values: { KEY: value } }`; empty deletes (revert to env), `••••…` ignored |
| POST | `/api/v1/admin/credentials/[provider]/test` | `integrations:manage` — live connection test |

`provider` ∈ `paymob | smtp | s3 | sms`.

## Storage

Table `provider_credentials` (migration `0003_credentials.sql`): `UNIQUE (store_id, provider, key_name)`, `value_encrypted`, `updated_by`. Rotating `SESSION_SECRET` makes existing rows undecryptable (they're skipped, reverting to env) — rotate credentials through the panel after a key‑rotation.

## Tests

`modules/credentials/credentials.integration.test.ts` proves: the stored row is ciphertext (not plaintext) and `getCredential` decrypts it; the listing never contains the full secret (only `••••1234`); a masked re‑save does not overwrite. Verified live: the S3 test connected to MinIO, SMTP reported "not set", and the saved key surfaced only masked.
