import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '../../http/context';
import { fixedClock } from '../../lib/clock';
import { dashboardOverview } from './overview';

const mocks = vi.hoisted(() => ({ where: vi.fn(), select: vi.fn(), count: vi.fn(), collected: vi.fn() }));
vi.mock('../../db/client', () => ({ db: () => ({ select: mocks.select }) }));
vi.mock('../catalog/repository', () => ({ countProducts: mocks.count }));
vi.mock('./service', () => ({ collectedTotals: mocks.collected }));
const ctx = (permissions: string[], staff = true) => ({ principal: { user: { isStaff: staff }, permissions: new Set(permissions) } }) as unknown as RequestContext;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.select.mockReturnValue({ from: () => ({ where: mocks.where }) });
  mocks.where.mockResolvedValue([{ count: 0 }]);
  mocks.count.mockResolvedValue(3);
  mocks.collected.mockResolvedValue({ gross: 100, refunded: 25, net: 75 });
});

describe('dashboard overview', () => {
  it('rejects guests and customers before touching any data', async () => {
    await expect(dashboardOverview({ principal: null } as RequestContext)).rejects.toThrow();
    await expect(dashboardOverview(ctx(['reports:view'], false))).rejects.toThrow();
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.collected).not.toHaveBeenCalled();
  });
  it('does not query or disclose metrics outside the staff permissions', async () => {
    const result = await dashboardOverview(ctx(['orders:view']));
    expect(result).toMatchObject({ todayOrders: 0, revenue: null, customers: null, lowStock: null });
    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(mocks.count).not.toHaveBeenCalled();
    expect(mocks.collected).not.toHaveBeenCalled();
  });
  it('uses net collections, registered customers, and the existing low-stock query', async () => {
    mocks.where.mockResolvedValueOnce([{ count: 2 }]).mockResolvedValueOnce([{ count: 17 }]);
    const result = await dashboardOverview(ctx(['orders:view', 'reports:view', 'customers:view', 'inventory:view']), fixedClock('2026-09-25T21:30:00Z'));
    expect(result).toEqual({ todayOrders: 2, revenue: 75, customers: 17, lowStock: 3, timeZone: 'Africa/Cairo', asOf: '2026-09-25T21:30:00.000Z' });
    expect(mocks.count).toHaveBeenCalledWith({ lowStockOnly: true, limit: 1 }, { visibleOnly: false });
  });
  it('propagates data failures instead of manufacturing zero statistics', async () => {
    mocks.collected.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(dashboardOverview(ctx(['reports:view']))).rejects.toThrow('database unavailable');
  });
});