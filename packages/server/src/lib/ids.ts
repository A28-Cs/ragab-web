/**
 * Identifiers. ULIDs are lexicographically sortable by creation time (good for
 * keyset pagination and index locality) and collision-resistant — unlike the
 * prototype's `Date.now()`/`Math.random()` order numbers, which could collide.
 */
import { ulid } from 'ulid';

export const newId = (): string => ulid();

/** Prefixed id for readability in logs/URLs, e.g. `ord_01J...`. Still a valid unique id. */
export const prefixedId = (prefix: string): string => `${prefix}_${ulid()}`;

/**
 * Human-facing order number: MHS- + a zero-padded, monotonic-ish base32 tail.
 * Uniqueness is enforced by a UNIQUE constraint on orders.order_number; the caller
 * retries on the (astronomically rare) conflict.
 */
export function generateOrderNumber(): string {
  const tail = ulid().slice(-8);
  return `MHS-${tail}`;
}

export function generateInvoiceNumber(): string {
  return `INV-${ulid().slice(-8)}`;
}
