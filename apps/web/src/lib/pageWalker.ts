/**
 * Walks a cursor-paginated collection to the end (bounded). Admin screens that filter
 * client-side (customers, products) must see EVERY row — a silent `limit: 100` hid the
 * 101st product from staff. Bounded so a runaway collection can never hang the page.
 */
import { api, type PageResult } from './apiClient';

export async function fetchAllPages<T>(
  path: string,
  params: Record<string, unknown> = {},
  opts: { pageSize?: number; maxPages?: number } = {},
): Promise<T[]> {
  const pageSize = opts.pageSize ?? 100;
  const maxPages = opts.maxPages ?? 50;
  const out: T[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const page = await api.get<PageResult<T>>(path, { ...params, limit: pageSize, cursor });
    out.push(...page.items);
    if (!page.hasMore || !page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return out;
}
