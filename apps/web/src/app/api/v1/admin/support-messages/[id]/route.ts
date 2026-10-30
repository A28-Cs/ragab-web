import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, supportMessages } from '@ragab/server/db';
import { NotFoundError } from '@ragab/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  status: z.enum(['new', 'in_progress', 'resolved', 'closed']).optional(),
  adminNotes: z.string().max(1000).optional(),
});

export const PATCH = defineRoute({
  method: 'PATCH',
  permission: { resource: 'customers', action: 'edit' },
  paramsSchema: z.object({ id: z.string().min(1).max(64) }),
  bodySchema: updateSchema,
  handler: async ({ params, body, ctx }) => {
    const [existing] = await db()
      .select({ id: supportMessages.id })
      .from(supportMessages)
      .where(eq(supportMessages.id, params.id))
      .limit(1);

    if (!existing) {
      throw new NotFoundError({
        code: 'SUPPORT_MESSAGE_NOT_FOUND',
        message: { ar: 'رسالة الدعم غير موجودة.', en: 'Support message not found.' },
      });
    }

    const updates: Partial<typeof supportMessages.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (body.status !== undefined) updates.status = body.status;
    if (body.adminNotes !== undefined) updates.adminNotes = body.adminNotes;
    if (body.status === 'resolved' || body.status === 'closed') {
      updates.resolvedBy = ctx.principal?.userId ?? null;
    }

    const [updated] = await db()
      .update(supportMessages)
      .set(updates)
      .where(eq(supportMessages.id, params.id))
      .returning();

    return {
      id: updated.id,
      status: updated.status,
      adminNotes: updated.adminNotes,
      updatedAt: updated.updatedAt.toISOString(),
    };
  },
});
