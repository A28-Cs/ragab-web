import { describe, it, expect } from 'vitest';
import {
  verificationEmail,
  passwordResetEmail,
  orderConfirmationEmail,
  orderStatusEmail,
  paymentConfirmedEmail,
  refundIssuedEmail,
  type OrderEmailSummary,
} from './email';

const SUMMARY: OrderEmailSummary = {
  orderNumber: 'MHS-123',
  subtotal: 190,
  deliveryFee: 15,
  discount: 0,
  total: 205,
  items: [{ nameAr: 'زيت عباد الشمس', nameEn: 'Sunflower oil', quantity: 2, total: 190 }],
  address: { recipientName: 'أحمد <b>', phone: '01012345678', village: 'قرية عليم', streetAddress: 'شارع المدرسة', landmark: 'بجوار الصيدلية' },
  paymentMethod: 'cod',
};

describe('email templates', () => {
  it('verification email includes the code and is bilingual', () => {
    const t = verificationEmail('123456');
    expect(t.subject).toContain('Ragab');
    expect(t.html).toContain('123456');
    expect(t.html).toContain('dir="rtl"');
    expect(t.html).toContain('dir="ltr"');
  });

  it('password reset escapes the URL', () => {
    const t = passwordResetEmail('https://app/forgot-password?token=abc"<script>');
    expect(t.html).not.toContain('<script>');
    expect(t.html).toContain('&lt;script&gt;');
  });

  it('order confirmation carries number, totals, items, address and payment method', () => {
    const t = orderConfirmationEmail(SUMMARY);
    expect(t.subject).toContain('MHS-123');
    expect(t.html).toContain('205.00');
    expect(t.html).toContain('190.00');
    expect(t.html).toContain('15.00');
    expect(t.html).toContain('زيت عباد الشمس × 2');
    expect(t.html).toContain('Sunflower oil × 2');
    expect(t.html).toContain('قرية عليم');
    expect(t.html).toContain('شارع المدرسة');
    expect(t.html).toContain('بجوار الصيدلية');
    expect(t.html).toContain('01012345678');
    expect(t.html).toContain('الدفع عند الاستلام');
    expect(t.html).toContain('Cash on delivery');
    expect(t.text).toContain('قرية عليم');
  });

  it('escapes customer-supplied address text', () => {
    const t = orderConfirmationEmail(SUMMARY);
    expect(t.html).not.toContain('أحمد <b>');
    expect(t.html).toContain('أحمد &lt;b&gt;');
  });

  it('shows free delivery and a discount line only when relevant', () => {
    const free = orderConfirmationEmail({ ...SUMMARY, deliveryFee: 0, discount: 20 });
    expect(free.html).toContain('مجانًا');
    expect(free.html).toContain('-20.00');
    expect(orderConfirmationEmail(SUMMARY).html).not.toContain('الخصم');
  });

  it('renders the order link only when a URL is given', () => {
    expect(orderConfirmationEmail(SUMMARY).html).not.toContain('عرض الطلب');
    const withLink = orderConfirmationEmail({ ...SUMMARY, orderUrl: 'https://ragab.sa/account/orders/ord_1' });
    expect(withLink.html).toContain('href="https://ragab.sa/account/orders/ord_1"');
  });

  it('status email picks the copy for the new status and keeps the address', () => {
    const cancelled = orderStatusEmail(SUMMARY, 'cancelled');
    expect(cancelled.subject).toContain('تم إلغاء طلبك');
    expect(cancelled.subject).toContain('cancelled');
    expect(cancelled.html).toContain('قرية عليم');
    const delivered = orderStatusEmail(SUMMARY, 'delivered');
    expect(delivered.subject).toContain('تم توصيل طلبك');
    const onTheWay = orderStatusEmail(SUMMARY, 'on_the_way');
    expect(onTheWay.html).toContain('خرج طلبك للتوصيل');
  });

  it('status email falls back to a generic update for an unknown status', () => {
    const t = orderStatusEmail(SUMMARY, 'something_else');
    expect(t.subject).toContain('تحديث حالة الطلب');
    expect(t.html).toContain('MHS-123');
  });

  it('payment confirmed and refund emails carry the number and amount', () => {
    expect(paymentConfirmedEmail({ ...SUMMARY, paymentMethod: 'instapay' }).html).toContain('إنستاباي');
    const r = refundIssuedEmail(SUMMARY, 50);
    expect(r.subject).toContain('MHS-123');
    expect(r.html).toContain('50.00 ج.م');
    expect(r.html).toContain('50.00 EGP');
  });
});
