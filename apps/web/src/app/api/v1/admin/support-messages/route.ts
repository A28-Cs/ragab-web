import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db, supportMessages } from '@ragab/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  method: 'GET',
  permission: { resource: 'customers', action: 'view' },
  querySchema: z.object({
    status: z.enum(['all', 'new', 'in_progress', 'resolved', 'closed']).optional().default('all'),
    limit: z.coerce.number().min(1).max(100).optional().default(50),
  }),
  handler: async ({ query }) => {
    let q = db()
      .select()
      .from(supportMessages)
      .$dynamic();

    if (query.status && query.status !== 'all') {
      q = q.where(eq(supportMessages.status, query.status));
    }

    const rows = await q.orderBy(desc(supportMessages.createdAt)).limit(query.limit);

    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      name: r.name,
      phone: r.phone,
      email: r.email,
      category: r.category,
      orderNumber: r.orderNumber,
      message: r.message,
      status: r.status,
      adminNotes: r.adminNotes,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  },
});
