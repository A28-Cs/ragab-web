export function formatCurrency(amount: number, currency = 'ج.م'): string {
  return `${amount.toFixed(2)} ${currency}`;
}

export function formatDiscount(percentage: number): string {
  return `خصم ${percentage}%`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
