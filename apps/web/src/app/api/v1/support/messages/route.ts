import { defineRoute } from '@ragab/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, users, notifications, supportMessages } from '@ragab/server/db';
import { logAudit } from '@ragab/server/modules/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supportMessageSchema = z.object({
  name: z.string().max(128).optional(),
  phone: z.string().max(32).optional(),
  email: z.string().email().optional(),
  message: z.string().min(2, { message: 'Message is too short' }).max(2000),
  orderNumber: z.string().max(64).optional(),
  category: z.string().max(64).optional().default('general'),
});

export const POST = defineRoute({
  method: 'POST',
  auth: 'optional',
  bodySchema: supportMessageSchema,
  handler: async ({ body, ctx }) => {
    let userName = body.name?.trim() || '';
    let userPhone = body.phone?.trim() || '';
    let userEmail = body.email?.trim() || '';
    let userId: string | null = null;
    let actorRole = 'anonymous';

    if (ctx.principal) {
      userId = ctx.principal.userId;
      actorRole = ctx.principal.roleId || 'customer';
      const [u] = await db()
        .select({ name: users.name, phone: users.phone, email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (u) {
        if (!userName) userName = u.name;
        if (!userPhone) userPhone = u.phone;
        if (!userEmail && u.email) userEmail = u.email;
      }
    }

    if (!userName) userName = 'عميل صيدلية رجب';

    // Save support ticket in DB
    const [inserted] = await db()
      .insert(supportMessages)
      .values({
        userId,
        name: userName,
        phone: userPhone,
        email: userEmail || null,
        category: body.category || 'general',
        orderNumber: body.orderNumber?.trim() || null,
        message: body.message.trim(),
        status: 'new',
      })
      .returning();

    // Record audit entry for customer service & staff tracking
    await logAudit({
      actorId: userId,
      actorName: userName,
      actorRole,
      action: 'support_message_submitted',
      resource: 'support_messages',
      resourceId: inserted?.id || body.orderNumber || null,
      metadata: {
        ticketId: inserted?.id || '',
        phone: userPhone,
        email: userEmail,
        category: body.category || 'general',
        orderNumber: body.orderNumber || '',
        message: body.message,
      },
    });

    // Send in-app notification to the logged-in customer confirming receipt
    if (userId) {
      try {
        await db().insert(notifications).values({
          userId,
          category: 'general',
          titleAr: 'تم استلام رسالتك بنجاح',
          titleEn: 'Support message received',
          bodyAr: 'شكراً لتواصلك معنا. تم تسجيل استفسارك وسيقوم فريق الدعم بالتواصل معك.',
          bodyEn: 'Thank you for reaching out. Your inquiry was received and support will contact you.',
          read: false,
        });
      } catch {
        // notification failure should not block response
      }
    }

    return {
      ok: true,
      message: 'تم إرسال رسالتك بنجاح وسيقوم فريق خدمة العملاء بالتواصل معك قريباً.',
    };
  },
});
