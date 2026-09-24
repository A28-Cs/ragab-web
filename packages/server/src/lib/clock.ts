/**
 * Clock abstraction — so time-dependent logic (token expiry, reservation windows,
 * webhook replay checks) is deterministically testable. Never call `new Date()`
 * directly in domain code; inject a Clock.
 */
export interface Clock {
  now(): Date;
  nowMs(): number;
}

export const systemClock: Clock = {
  now: () => new Date(),
  nowMs: () => Date.now(),
};

/** Fixed clock for tests. */
export function fixedClock(iso: string): Clock {
  const ms = new Date(iso).getTime();
  return { now: () => new Date(ms), nowMs: () => ms };
}

/**
 * The frontend contract stores timestamps as "YYYY-MM-DD HH:mm" (local-ish) strings.
 * We keep timestamptz in the DB and project to this legacy shape at the mapper boundary,
 * while ALSO exposing the true ISO string in a parallel `*Iso` field.
 */
export function toLegacyTimestamp(d: Date): string {
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

export function toLegacyDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
