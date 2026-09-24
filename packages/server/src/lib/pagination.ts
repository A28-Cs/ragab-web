/**
 * Keyset (cursor) pagination (§25). Every collection endpoint caps `limit` and
 * returns an opaque cursor, so no query can ever return an unbounded result set.
 */
import { z } from 'zod';

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 24;

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  /** Opaque cursor (base64url of the last seen sort key). */
  cursor: z.string().max(512).optional(),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  /** Rows matching the filters (cursor excluded) — set by listings that count; drives "N results" + page counts. */
  total?: number;
}

export function encodeCursor(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | undefined): string | null {
  if (!cursor) return null;
  try {
    return Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

export function buildPage<T>(rows: T[], limit: number, keyOf: (row: T) => string): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    hasMore,
    nextCursor: hasMore && last ? encodeCursor(keyOf(last)) : null,
  };
}
