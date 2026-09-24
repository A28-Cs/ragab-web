/**
 * Test setup. Provides deterministic env defaults so unit tests never touch real
 * secrets. Integration tests override DATABASE_URL to point at a Testcontainers or
 * local throwaway Postgres.
 */
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';
process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? 'test-session-secret-32-bytes-minimum-abc123';
process.env.CSRF_SECRET = process.env.CSRF_SECRET ?? 'test-csrf-secret-32-bytes-minimum-xyz78900';
process.env.RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED ?? 'false';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://ragab:ragab_dev_pw@localhost:5434/ragab';
