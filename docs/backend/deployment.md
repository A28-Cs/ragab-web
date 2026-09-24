# Deployment, Health, Backup & DR (§41, §49, §50)

## Topology (Docker Compose)

`docker-compose.yml` brings up: **postgres 16**, **redis 7**, **minio**, a **migrate** one-shot (runs to completion before app/worker start), **web** (Next.js), and **worker** (BullMQ). The `migrate` service is a `depends_on … service_completed_successfully` gate, so the app never boots against an unmigrated database.

```bash
cp .env.example .env    # set SESSION_SECRET, CSRF_SECRET (32+ bytes), Paymob keys, S3/SMTP
docker compose up -d --build
```

## Environment

All variables are documented (names + shape) in `.env.example` and validated at boot by `config/env.ts` (Zod) — a missing/malformed secret crashes the process immediately rather than failing at request time. Secrets are never committed and never logged (logger redaction allowlist).

## Migrations (§40)

- `npm run db:generate` — drizzle-kit generates table DDL from the schema into `db/migrations/0000_*.sql`.
- Hand-authored `db/migrations/0001_integrity.sql` adds CHECK constraints, triggers, and search indexes.
- `npm run db:migrate` — the custom runner (`db/migrate.ts`) applies every `*.sql` once, tracked in `_migrations`, idempotent and safe to re-run.

Never edit production schema by hand; add a new migration file.

## Health checks (§50)

- `GET /api/health` — **liveness**: trivially 200 if the process runs. Wire to the container liveness probe.
- `GET /api/ready` — **readiness**: checks Postgres and Redis, returns `{ status, checks }` and HTTP 503 when degraded. No versions/hosts/errors are leaked. Wire to the readiness probe and load-balancer.

Kill Postgres and `/api/ready` fails while `/api/health` still passes — the intended distinction.

## Graceful shutdown

The worker drains in-flight jobs and closes Redis/DB on SIGTERM/SIGINT. Next.js handles connection draining on the platform's stop signal.

## Backup & Point-in-Time Recovery (§41)

1. **Automated backups** — schedule `pg_dump` (logical) daily and enable WAL archiving for PITR (`archive_mode=on`, ship WAL to object storage).
2. **Verify** — a backup is not a backup until a restore succeeds.

### Restore drill (run regularly)

```bash
# 1. take a dump
pg_dump "$DATABASE_URL" -Fc -f /backups/ragab-$(date +%F).dump
# 2. restore into a scratch database
createdb ragab_restore
pg_restore -d ragab_restore /backups/ragab-YYYY-MM-DD.dump
# 3. point the integration suite at it and run
DATABASE_URL=postgres://…/ragab_restore npm run test:integration
```

A green suite against the restored database proves the backup is recoverable and consistent.

## Disaster recovery

- **RPO** — bounded by backup/WAL-ship cadence (target ≤ 5 min with WAL archiving).
- **RTO** — provision a new Postgres, restore latest base backup + replay WAL, run migrations (no-op if current), bring up `migrate`→`web`/`worker`.
- **Payment reconciliation** — after recovery, the reconciliation job re-syncs any intents left non-terminal, and stored `payment_webhook_events` are the durable work items for reprocessing.
- **Idempotency** — replayed webhooks and retried checkouts are safe by construction, so recovery cannot double-charge or double-fulfill.

## Rollback

Deploy is image-based; roll back by redeploying the previous image tag. Migrations are additive where possible; each has a `-- down` section where safe reversal exists. Never roll a schema back under live traffic without a compatibility window.
